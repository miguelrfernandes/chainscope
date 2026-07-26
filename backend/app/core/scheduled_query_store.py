"""SQLite-backed storage for scheduled queries and query execution run logs.

Opened via fresh sqlite3 connection per call, following the agent_store.py pattern.
"""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import get_settings

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

_MIGRATIONS: List[str] = []


def _connect() -> sqlite3.Connection:
    db_path = get_settings().scheduled_query_db_path
    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    for migration in _MIGRATIONS:
        try:
            conn.execute(migration)
        except sqlite3.OperationalError:
            pass
    return conn


def _norm(address: str) -> str:
    return (address or "").lower().strip()


def save_query(
    owner_address: str,
    name: str,
    prompt: str,
    cron_expression: str,
) -> Dict[str, Any]:
    """Create a new scheduled query entry."""
    owner_address = _norm(owner_address)
    with closing(_connect()) as conn:
        cursor = conn.execute(
            """
            INSERT INTO scheduled_queries (owner_address, name, prompt, cron_expression, status)
            VALUES (?, ?, ?, ?, 'ACTIVE')
            """,
            (owner_address, name, prompt, cron_expression),
        )
        conn.commit()
        query_id = cursor.lastrowid
        row = conn.execute(
            """
            SELECT id, owner_address, name, prompt, cron_expression, status, created_at
            FROM scheduled_queries
            WHERE id = ?
            """,
            (query_id,),
        ).fetchone()
        return dict(row) if row else {}


def get_user_queries(owner_address: str) -> List[Dict[str, Any]]:
    """Get all non-archived scheduled queries for an owner, newest first."""
    owner_address = _norm(owner_address)
    with closing(_connect()) as conn:
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
    with closing(_connect()) as conn:
        row = conn.execute(
            """
            SELECT id, owner_address, name, prompt, cron_expression, status, created_at
            FROM scheduled_queries
            WHERE id = ?
            """,
            (query_id,),
        ).fetchone()
        return dict(row) if row else None


def archive_query(query_id: int, owner_address: Optional[str] = None) -> bool:
    """Archive a scheduled query by setting status='ARCHIVED'."""
    with closing(_connect()) as conn:
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

    with closing(_connect()) as conn:
        cursor = conn.execute(
            """
            INSERT INTO scheduled_query_runs (query_id, answer, sources_json, is_read)
            VALUES (?, ?, ?, 0)
            """,
            (query_id, answer, sources_json),
        )
        conn.commit()
        run_id = cursor.lastrowid
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
    with closing(_connect()) as conn:
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
    with closing(_connect()) as conn:
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
    with closing(_connect()) as conn:
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
