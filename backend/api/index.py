"""Vercel serverless entrypoint.

Vercel's Python runtime looks for a module-level ASGI callable named `app`,
so this re-exports the FastAPI application unchanged — there is deliberately
no second app definition to keep in sync with app/main.py.

Everything that makes this work on a host with no disk and no process
between requests is configuration, not code: set DATABASE_URL (Postgres,
since managed_agents holds encrypted keys that must outlive the request) and
SCHEDULER_MODE=external (no in-process APScheduler; an external cron POSTs
/api/scheduled-queries/tick instead). See docs/setup.md.
"""

from app.main import app

__all__ = ["app"]
