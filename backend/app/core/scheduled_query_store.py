"""Storage for scheduled queries and query execution run logs.

Backed by SQLite on a long-lived host and by Postgres when DATABASE_URL is
set — see app/core/db.py. A fresh connection is opened per call, following
the agent_store.py pattern.

`next_run_at` exists so the schedule survives without a live APScheduler:
in external scheduler mode nothing is holding cron triggers in memory, so
due-ness has to be a fact in the database that any invocation can read.
"""

import json
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.core.db import PG_UTC_NOW, connect, insert_returning_id

_SCHEMA = """
CREATE TABLE IF NOT EXISTS scheduled_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_address TEXT NOT NULL,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS scheduled_query_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id INTEGER NOT NULL,
    run_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    answer TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    is_read INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(query_id) REFERENCES scheduled_queries(id)
);
"""

_PG_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS scheduled_queries (
    id SERIAL PRIMARY KEY,
    owner_address TEXT NOT NULL,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT ({PG_UTC_NOW})
);

CREATE TABLE IF NOT EXISTS scheduled_query_runs (
    id SERIAL PRIMARY KEY,
    query_id INTEGER NOT NULL REFERENCES scheduled_queries(id),
    run_at TEXT NOT NULL DEFAULT ({PG_UTC_NOW}),
    answer TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    is_read INTEGER NOT NULL DEFAULT 0
)
"""

_MIGRATIONS: List[str] = [
    "ALTER TABLE scheduled_queries ADD COLUMN next_run_at TEXT",
]

_PG_MIGRATIONS: List[str] = [
    "ALTER TABLE scheduled_queries ADD COLUMN IF NOT EXISTS next_run_at TEXT",
]


def _connect():
    return connect(
        get_settings().scheduled_query_db_path,
        _SCHEMA,
        _PG_SCHEMA,
        _PG_MIGRATIONS if get_settings().database_url else _MIGRATIONS,
    )


def _norm(address: str) -> str:
    return (address or "").lower().strip()


def save_query(
    owner_address: str,
    name: str,
    prompt: str,
    cron_expression: str,
    next_run_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new scheduled query entry."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        query_id = insert_returning_id(
            conn,
            """
            INSERT INTO scheduled_queries (owner_address, name, prompt, cron_expression, status, next_run_at)
            VALUES (?, ?, ?, ?, 'ACTIVE', ?)
            """,
            (owner_address, name, prompt, cron_expression, next_run_at),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT id, owner_address, name, prompt, cron_expression, status, created_at, next_run_at
            FROM scheduled_queries
            WHERE id = ?
            """,
            (query_id,),
        ).fetchone()
        return dict(row) if row else {}


def get_due_queries(now_iso: str) -> List[Dict[str, Any]]:
    """Active queries whose next_run_at has passed.

    Rows with a NULL next_run_at are skipped rather than treated as due —
    they predate the column, and firing every one of them at once the first
    time an external tick lands would be a surprising side effect of an
    upgrade. They get a next_run_at as soon as they are rescheduled.
    """
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, owner_address, name, prompt, cron_expression, status, created_at, next_run_at
            FROM scheduled_queries
            WHERE status = 'ACTIVE' AND next_run_at IS NOT NULL AND next_run_at <= ?
            ORDER BY next_run_at ASC
            """,
            (now_iso,),
        ).fetchall()
        return [dict(row) for row in rows]


def set_next_run_at(query_id: int, next_run_at: Optional[str]) -> bool:
    """Record when a query should next fire (None to unschedule it)."""
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE scheduled_queries SET next_run_at = ? WHERE id = ?",
            (next_run_at, query_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def get_user_queries(owner_address: str) -> List[Dict[str, Any]]:
    """Get all non-archived scheduled queries for an owner, newest first."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, owner_address, name, prompt, cron_expression, status, created_at
            FROM scheduled_queries
            WHERE owner_address = ? AND status != 'ARCHIVED'
            ORDER BY created_at DESC
            """,
            (owner_address,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_query_by_id(query_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single scheduled query by ID."""
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT id, owner_address, name, prompt, cron_expression, status, created_at, next_run_at
            FROM scheduled_queries
            WHERE id = ?
            """,
            (query_id,),
        ).fetchone()
        return dict(row) if row else None


def archive_query(query_id: int, owner_address: Optional[str] = None) -> bool:
    """Archive a scheduled query by setting status='ARCHIVED'."""
    with _connect() as conn:
        if owner_address:
            cursor = conn.execute(
                """
                UPDATE scheduled_queries
                SET status = 'ARCHIVED'
                WHERE id = ? AND owner_address = ? AND status != 'ARCHIVED'
                """,
                (query_id, _norm(owner_address)),
            )
        else:
            cursor = conn.execute(
                """
                UPDATE scheduled_queries
                SET status = 'ARCHIVED'
                WHERE id = ? AND status != 'ARCHIVED'
                """,
                (query_id,),
            )
        conn.commit()
        return cursor.rowcount > 0


def save_run(
    query_id: int,
    answer: str,
    sources: Optional[Any] = None,
) -> Dict[str, Any]:
    """Save an execution run result for a scheduled query."""
    if sources is None:
        sources_json = "[]"
    elif isinstance(sources, str):
        sources_json = sources
    else:
        sources_json = json.dumps(sources)

    with _connect() as conn:
        run_id = insert_returning_id(
            conn,
            """
            INSERT INTO scheduled_query_runs (query_id, answer, sources_json, is_read)
            VALUES (?, ?, ?, 0)
            """,
            (query_id, answer, sources_json),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT id, query_id, run_at, answer, sources_json, is_read
            FROM scheduled_query_runs
            WHERE id = ?
            """,
            (run_id,),
        ).fetchone()
        res = dict(row) if row else {}
        if "sources_json" in res:
            try:
                res["sources"] = json.loads(res["sources_json"])
            except Exception:
                res["sources"] = []
        return res


def get_runs_for_query(query_id: int, owner_address: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch run history for a query, newest first."""
    with _connect() as conn:
        if owner_address:
            rows = conn.execute(
                """
                SELECT r.id, r.query_id, r.run_at, r.answer, r.sources_json, r.is_read
                FROM scheduled_query_runs r
                JOIN scheduled_queries q ON r.query_id = q.id
                WHERE r.query_id = ? AND q.owner_address = ?
                ORDER BY r.run_at DESC
                """,
                (query_id, _norm(owner_address)),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, query_id, run_at, answer, sources_json, is_read
                FROM scheduled_query_runs
                WHERE query_id = ?
                ORDER BY run_at DESC
                """,
                (query_id,),
            ).fetchall()

        runs = []
        for row in rows:
            d = dict(row)
            try:
                d["sources"] = json.loads(d["sources_json"])
            except Exception:
                d["sources"] = []
            runs.append(d)
        return runs


def get_unread_runs(owner_address: str) -> List[Dict[str, Any]]:
    """Fetch all unread runs for active queries belonging to owner_address."""
    owner_address = _norm(owner_address)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT r.id, r.query_id, r.run_at, r.answer, r.sources_json, r.is_read, q.name AS query_name, q.prompt
            FROM scheduled_query_runs r
            JOIN scheduled_queries q ON r.query_id = q.id
            WHERE q.owner_address = ? AND q.status = 'ACTIVE' AND r.is_read = 0
            ORDER BY r.run_at DESC
            """,
            (owner_address,),
        ).fetchall()

        runs = []
        for row in rows:
            d = dict(row)
            try:
                d["sources"] = json.loads(d["sources_json"])
            except Exception:
                d["sources"] = []
            runs.append(d)
        return runs


def mark_run_read(run_id: int, owner_address: Optional[str] = None) -> bool:
    """Mark a run as read (is_read = 1)."""
    with _connect() as conn:
        if owner_address:
            cursor = conn.execute(
                """
                UPDATE scheduled_query_runs
                SET is_read = 1
                WHERE id = ? AND query_id IN (
                    SELECT id FROM scheduled_queries WHERE owner_address = ?
                )
                """,
                (run_id, _norm(owner_address)),
            )
        else:
            cursor = conn.execute(
                """
                UPDATE scheduled_query_runs
                SET is_read = 1
                WHERE id = ?
                """,
                (run_id,),
            )
        conn.commit()
        return cursor.rowcount > 0
