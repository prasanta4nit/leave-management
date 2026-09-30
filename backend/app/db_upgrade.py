"""Small idempotent schema upgrades for databases created before a column existed.

There is no migration tool yet, and `create_all` never alters existing tables. Each entry below adds
one nullable column if it's missing; the app runs this at startup, so deploying new code can't break
queries on an older database. Replace with Alembic if schema changes become frequent.

Manual equivalent (MySQL):
    ALTER TABLE leave_requests ADD COLUMN cc_emails JSON NULL;
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from . import models
from .database import engine

logger = logging.getLogger(__name__)

# (table, column) pairs added after the first release. Columns must be nullable.
ADDED_COLUMNS = [
    (models.LeaveRequest.__table__, "cc_emails"),
]


def upgrade_schema(bind: Engine | None = None) -> list[str]:
    """Add any missing columns. Returns the columns added (empty when already up to date)."""
    bind = bind or engine
    quote = bind.dialect.identifier_preparer.quote
    added: list[str] = []
    for table, name in ADDED_COLUMNS:
        insp = inspect(bind)
        if not insp.has_table(table.name):
            continue  # create_all will create the table with the column
        if name in {c["name"] for c in insp.get_columns(table.name)}:
            continue
        col = table.c[name]
        ddl = f"ALTER TABLE {quote(table.name)} ADD COLUMN {quote(name)} {col.type.compile(dialect=bind.dialect)} NULL"
        try:
            with bind.begin() as conn:
                conn.execute(text(ddl))
            added.append(f"{table.name}.{name}")
        except Exception:
            # Another instance may have added it at the same moment - fine if it's there now.
            if name not in {c["name"] for c in inspect(bind).get_columns(table.name)}:
                raise
    return added


def upgrade_schema_safely() -> None:
    """Startup hook: never stop the app from starting, but make failures loud in the logs."""
    try:
        added = upgrade_schema()
        if added:
            logger.info("Database schema upgraded: added %s", ", ".join(added))
    except Exception:
        logger.exception(
            "Database schema upgrade failed. Run the SQL in app/db_upgrade.py manually "
            "(the database user needs ALTER on the schema)."
        )
