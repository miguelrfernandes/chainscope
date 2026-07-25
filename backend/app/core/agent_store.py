"""SQLite-backed storage for managed Hedera agent accounts — one row per
(owner_address, agent_name), holding the agent's Hedera account ID and its
private key encrypted at rest. This module never sees plaintext key
material: callers encrypt before calling save_agent and decrypt after
reading it back — the store's only job is durable, keyed lookup.

A fresh sqlite3 connection is opened per call rather than shared across
threads, since sqlite3 connections aren't safe to use from a thread other
than the one that created them and this module has no async/request-scoped
lifecycle to hook into.
"""

import sqlite3
from contextlib import closing
from pathlib import Path

from app.core.config import get_settings

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


def _connect() -> sqlite3.Connection:
    db_path = get_settings().managed_agent_db_path
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute(_SCHEMA)
    return conn


def save_agent(owner_address: str, agent_name: str, account_id: str, encrypted_private_key: str) -> None:
    """Create or update the managed agent identified by
    (owner_address, agent_name), replacing its account ID and encrypted key."""
    with closing(_connect()) as conn:
        conn.execute(
            """
            INSERT INTO managed_agents (owner_address, agent_name, account_id, encrypted_private_key)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (owner_address, agent_name)
            DO UPDATE SET account_id = excluded.account_id,
                          encrypted_private_key = excluded.encrypted_private_key
            """,
            (owner_address, agent_name, account_id, encrypted_private_key),
        )
        conn.commit()


def get_user_agents(owner_address: str) -> list[dict]:
    """All managed agents belonging to owner_address, oldest first."""
    with closing(_connect()) as conn:
        rows = conn.execute(
            """
            SELECT agent_name, account_id, encrypted_private_key, status, created_at
            FROM managed_agents
            WHERE owner_address = ?
            ORDER BY created_at ASC
            """,
            (owner_address,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_agent_by_name(owner_address: str, agent_name: str) -> dict | None:
    """The single managed agent for (owner_address, agent_name), or None."""
    with closing(_connect()) as conn:
        row = conn.execute(
            """
            SELECT agent_name, account_id, encrypted_private_key, status, created_at
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
    with closing(_connect()) as conn:
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
