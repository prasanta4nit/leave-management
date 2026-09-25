"""Create tables (idempotent). Usage: python -m app.db_init [--sql]  (--sql prints MySQL DDL instead)."""

import sys

from sqlalchemy import create_mock_engine

from . import models  # noqa: F401  (registers tables)
from .database import Base, engine


def create_all() -> None:
    Base.metadata.create_all(engine)


def print_mysql_ddl() -> None:
    def dump(sql, *_, **__):
        print(str(sql.compile(dialect=mock.dialect)).strip() + ";\n")

    mock = create_mock_engine("mysql+pymysql://", dump)
    Base.metadata.create_all(mock, checkfirst=False)


if __name__ == "__main__":
    if "--sql" in sys.argv:
        print_mysql_ddl()
    else:
        create_all()
        print("Tables created.")
