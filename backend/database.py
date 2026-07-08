"""
Database engine, session factory, and schema initialization.
Uses SQLite (file: meetings.db at project root) for zero-config local storage.
"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import event

# meetings.db lives at the project root (same place as .env)
DB_PATH = Path(__file__).parent.parent / "meetings.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={
        "check_same_thread": False,  # allow writes from Whisper thread
        "timeout": 30,              # wait on locked DB instead of erroring
    },
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, conn_record):
    """Enable WAL journaling for better concurrent read/write throughput."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

Base = declarative_base()


def run_migrations():
    """Apply Alembic migrations to bring the DB up to the latest schema."""
    from alembic.config import Config
    from alembic import command

    root = Path(__file__).parent.parent
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "migrations"))
    cfg.set_main_option("sqlalchemy.url", str(engine.url))
    command.upgrade(cfg, "head")


def init_db():
    """Initialize the database schema.

    Prefers Alembic migrations (so schema changes are versioned). Falls back
    to `create_all` if Alembic is unavailable or errors, so the app still
    boots on a fresh checkout.
    """
    from backend import models  # noqa: F401  (register models on Base.metadata)

    try:
        run_migrations()
    except Exception as e:
        from loguru import logger

        logger.warning(f"Migrations failed, falling back to create_all: {e}")
        Base.metadata.create_all(engine)
