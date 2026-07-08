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


def _tables_exist() -> bool:
    """Check if any model tables already exist (outside Alembic tracking)."""
    from sqlalchemy import inspect
    from backend import models  # noqa: F401

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    model_tables = set(Base.metadata.tables.keys())
    return bool(model_tables & existing)


def init_db():
    """Initialize the database schema.

    Prefers Alembic migrations (so schema changes are versioned). Falls back
    to `create_all` if Alembic is unavailable or errors, so the app still
    boots on a fresh checkout.
    """
    from backend import models  # noqa: F401  (register models on Base.metadata)
    from loguru import logger

    # Check if tables exist but Alembic version is missing
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    has_alembic_table = "alembic_version" in inspector.get_table_names()
    has_model_tables = _tables_exist()

    if has_model_tables and not has_alembic_table:
        # Database was created outside Alembic — stamp it to current head
        logger.info("Tables exist without Alembic tracking — stamping to head")
        from alembic.config import Config
        from alembic import command
        root = Path(__file__).parent.parent
        cfg = Config(str(root / "alembic.ini"))
        cfg.set_main_option("script_location", str(root / "migrations"))
        cfg.set_main_option("sqlalchemy.url", str(engine.url))
        command.stamp(cfg, "head")
        return

    try:
        run_migrations()
    except Exception as e:
        logger.warning(f"Migrations failed, falling back to create_all: {e}")
        Base.metadata.create_all(engine)
