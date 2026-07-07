"""
Database engine, session factory, and schema initialization.
Uses SQLite (file: meetings.db at project root) for zero-config local storage.
"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# meetings.db lives at the project root (same place as .env)
DB_PATH = Path(__file__).parent.parent / "meetings.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},  # allow writes from Whisper thread
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

Base = declarative_base()


def init_db():
    """Create tables if they don't exist. Safe to call multiple times."""
    from backend import models  # noqa: F401  (register models on Base.metadata)

    Base.metadata.create_all(engine)
