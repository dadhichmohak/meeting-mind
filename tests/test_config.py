"""Tests for configuration loading and DB engine setup."""
from backend.config import Config
from backend.database import engine


def test_config_defaults_present():
    assert isinstance(Config.BACKEND_PORT, int)
    assert Config.GROQ_MODEL
    assert Config.FRONTEND_URL.startswith("http")


def test_engine_url_is_sqlite():
    assert str(engine.url).startswith("sqlite")
