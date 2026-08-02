"""Durable storage for managed Hedera agent accounts — one row per
(owner_address, agent_name), holding the agent's Hedera account ID and its
private key encrypted at rest. This module never sees plaintext key
material: callers encrypt before calling save_agent and decrypt after
reading it back — the store's only job is durable, keyed lookup.

Backed by SQLite on a long-lived host and by Postgres when DATABASE_URL is
set (serverless, where no disk survives the request) — see app/core/db.py.
A fresh connection is opened per call rather than shared across threads,
since sqlite3 connections aren't safe to use from a thread other than the
one that created them and this module has no async/request-scoped lifecycle
to hook into.
"""


from app.core.config import get_settings
from app.core.db import PG_UTC_NOW, connect

_SCHEMA = """
CREATE TABLE IF NOT EXISTS managed_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_address TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (owner_address, agent_name)
)
"""

_PG_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS managed_agents (
    id SERIAL PRIMARY KEY,
    owner_address TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL DEFAULT ({PG_UTC_NOW}),
    UNIQUE (owner_address, agent_name)
)
"""

# Agent accounts are now provisioned "on demand": a keypair is generated up
# front and its EVM address is permanent, but the account itself doesn't
# exist on Hedera until Auto Account Creation materializes it on first seed
# funding — so account_id starts empty and is filled in later by
# set_agent_account_and_status. evm_address is the durable lookup key in the
# meantime (see app/tools/hedera_provisioner.py, app/api/agent_actions.py).
_MIGRATIONS = [
    "ALTER TABLE managed_agents ADD COLUMN evm_address TEXT NOT NULL DEFAULT ''",
]

_PG_MIGRATIONS = [
    "ALTER TABLE managed_agents ADD COLUMN IF NOT EXISTS evm_address TEXT NOT NULL DEFAULT ''",
]


def _connect():
    return connect(
        get_settings().managed_agent_db_path,
        _SCHEMA,
        _PG_SCHEMA,
        _PG_MIGRATIONS if get_settings().database_url else _MIGRATIONS,
    )


def _norm(address: str) -> str:
    return (address or "").lower().strip()


def save_agent(
    owner_address: str,
    agent_name: str,
    evm_address: str,
    encrypted_private_key: str,
    account_id: str = "",
) -> None:
    """Create or update the managed agent identified by
    (owner_address, agent_name). `account_id` is normally empty at creation
    time — the account doesn't exist on-chain yet — and gets filled in by
    set_agent_account_and_status once seed funding auto-creates it."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO managed_agents (owner_address, agent_name, account_id, evm_address, encrypted_private_key)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (owner_address, agent_name)
            DO UPDATE SET account_id = excluded.account_id,
                          evm_address = excluded.evm_address,
                          encrypted_private_key = excluded.encrypted_private_key
            """,
            (owner_address, agent_name, account_id, evm_address, encrypted_private_key),
        )
        conn.commit()


def get_user_agents(owner_address: str) -> list[dict]:
    """All managed agents belonging to owner_address, oldest first."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT agent_name, account_id, evm_address, encrypted_private_key, status, created_at
            FROM managed_agents
            WHERE owner_address = ?
            ORDER BY created_at ASC
            """,
            (owner_address,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_agent_by_name(owner_address: str, agent_name: str) -> dict | None:
    """The single managed agent for (owner_address, agent_name), or None."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT agent_name, account_id, evm_address, encrypted_private_key, status, created_at
            FROM managed_agents
            WHERE owner_address = ? AND agent_name = ?
            """,
            (owner_address, agent_name),
        ).fetchone()
        return dict(row) if row else None


def set_agent_status(owner_address: str, agent_name: str, status: str) -> bool:
    """Update the lifecycle status (e.g. 'PENDING' -> 'ACTIVE') of the managed
    agent identified by (owner_address, agent_name). Returns whether a row was
    found and updated."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        cursor = conn.execute(
            """
            UPDATE managed_agents
            SET status = ?
            WHERE owner_address = ? AND agent_name = ?
            """,
            (status, owner_address, agent_name),
        )
        conn.commit()
        return cursor.rowcount > 0


def set_agent_account_and_status(
    owner_address: str, agent_name: str, account_id: str, status: str
) -> bool:
    """Record the real Hedera account_id resolved from Mirror Node after
    Auto Account Creation and update lifecycle status in one step. Returns
    whether a row was found and updated."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        cursor = conn.execute(
            """
            UPDATE managed_agents
            SET account_id = ?, status = ?
            WHERE owner_address = ? AND agent_name = ?
            """,
            (account_id, status, owner_address, agent_name),
        )
        conn.commit()
        return cursor.rowcount > 0


def archive_agent(owner_address: str, agent_name: str) -> bool:
    """Archive the managed agent for (owner_address, agent_name) by setting status='ARCHIVED'.
    Returns True if a row was found and updated to ARCHIVED, False if missing or already ARCHIVED."""
    agent = get_agent_by_name(owner_address, agent_name)
    if not agent or agent.get("status") == "ARCHIVED":
        return False
    return set_agent_status(owner_address, agent_name, "ARCHIVED")


def unarchive_agent(owner_address: str, agent_name: str) -> bool:
    """Unarchive/restore the managed agent for (owner_address, agent_name).
    Restores status to 'ACTIVE' if account_id is populated, otherwise 'PENDING'.
    Returns True if a row was found and updated from ARCHIVED, False otherwise."""
    agent = get_agent_by_name(owner_address, agent_name)
    if not agent or agent.get("status") != "ARCHIVED":
        return False
    restored_status = "ACTIVE" if agent.get("account_id") else "PENDING"
    return set_agent_status(owner_address, agent_name, restored_status)


def delete_agent(owner_address: str, agent_name: str) -> bool:
    """Archive the managed agent for (owner_address, agent_name) instead of hard-deleting.
    Returns True if a row was updated, False otherwise."""
    return archive_agent(owner_address, agent_name)
