"""Dialect-portable connection helper shared by the SQLite-backed stores.

The backend runs in two shapes:

- **Local dev / VPS** — SQLite files on disk (the historical default).
- **Serverless (Vercel)** — no writable disk survives a request, so the same
  tables live in Postgres, selected by setting `DATABASE_URL`.

Rather than maintain two copies of every query, the stores write SQLite-style
SQL with `?` placeholders and this module adapts it: `?` becomes `%s` on
Postgres, rows come back as dicts either way, and `insert_returning_id`
papers over `cursor.lastrowid` (SQLite) vs `RETURNING id` (Postgres).

Schema DDL genuinely differs between the two (autoincrement syntax, the
timestamp default), so each store supplies both variants and picks via
`is_postgres()`.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Sequence

from app.core.config import get_settings

# Postgres equivalent of SQLite's
# strftime('%Y-%m-%dT%H:%M:%fZ', 'now') — keeps created_at/run_at as ISO-8601
# TEXT in both dialects so API responses are byte-identical either way.
PG_UTC_NOW = "to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"


def is_postgres() -> bool:
    """Whether the stores should target Postgres rather than local SQLite."""
    return bool(get_settings().database_url)


def _translate(sql: str) -> str:
    """Rewrite `?` placeholders to `%s` for psycopg.

    Only placeholders are rewritten — `?` never appears otherwise in the
    stores' SQL, and string literals containing `?` would need quoting-aware
    parsing, so keep it that way.
    """
    return sql.replace("?", "%s")


class _PgConnection:
    """Thin adapter giving a psycopg connection the sqlite3 surface the stores use."""

    def __init__(self, conn: Any) -> None:
        self._conn = conn

    def execute(self, sql: str, params: Sequence[Any] = ()) -> Any:
        cur = self._conn.cursor()
        cur.execute(_translate(sql), tuple(params))
        return cur

    def executescript(self, script: str) -> None:
        for statement in script.split(";"):
            if statement.strip():
                self._conn.cursor().execute(statement)

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


@contextmanager
def connect(sqlite_path: str, schema: str, pg_schema: str, migrations: Sequence[str] = ()) -> Iterator[Any]:
    """Yield a connection with `schema` applied, closing it on exit.

    `schema`/`pg_schema` are the dialect-specific CREATE TABLE scripts;
    `migrations` are idempotent ALTERs applied best-effort, matching the
    stores' existing "try it, ignore if the column exists" behaviour.
    """
    if is_postgres():
        import psycopg
        from psycopg.rows import dict_row

        raw = psycopg.connect(get_settings().database_url, row_factory=dict_row)
        conn = _PgConnection(raw)
        conn.executescript(pg_schema)
        for migration in migrations:
            try:
                conn.execute(migration)
            except Exception:
                raw.rollback()
        conn.commit()
        try:
            yield conn
        finally:
            conn.close()
        return

    if sqlite_path != ":memory:":
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(schema)
    for migration in migrations:
        try:
            conn.execute(migration)
        except sqlite3.OperationalError:
            pass  # column already exists
    try:
        yield conn
    finally:
        conn.close()


def rows_to_dicts(cursor: Any) -> list[dict]:
    """Fetch all rows as plain dicts, regardless of dialect."""
    return [dict(row) for row in cursor.fetchall()]


def row_to_dict(cursor: Any) -> dict | None:
    """Fetch one row as a plain dict, or None."""
    row = cursor.fetchone()
    return dict(row) if row else None


def insert_returning_id(conn: Any, sql: str, params: Sequence[Any]) -> int:
    """Run an INSERT and return the new row's integer id.

    SQLite exposes it as `cursor.lastrowid`; Postgres needs an explicit
    `RETURNING id`, which is appended here so callers write one query.
    """
    if is_postgres():
        cursor = conn.execute(sql.rstrip().rstrip(";") + " RETURNING id", params)
        row = cursor.fetchone()
        return int(row["id"])
    cursor = conn.execute(sql, params)
    return int(cursor.lastrowid)
