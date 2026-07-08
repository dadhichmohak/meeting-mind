"""Alembic environment — binds to the app's SQLAlchemy engine/metadata."""
from logging.config import fileConfig

from alembic import context

from backend.database import Base, engine
import backend.models  # noqa: F401  (register models on Base.metadata)

config = context.config

if config.config_file_name:
    try:
        fileConfig(config.config_file_name)
    except Exception:
        pass

config.set_main_option("sqlalchemy.url", str(engine.url))
target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(
        url=str(engine.url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
