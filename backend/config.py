"""
Configuration management — loads from .env and environment.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from loguru import logger

# Load .env from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

logger.debug(f"Loading .env from {env_path} (exists: {env_path.exists()})")


class Config:
    # Groq LLM
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    # Server
    BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
    BACKEND_PORT = int(os.getenv("BACKEND_PORT", 8765))

    # Frontend
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

    @staticmethod
    def validate():
        """Check that required configs are set."""
        if not Config.GROQ_API_KEY:
            logger.warning("⚠️  GROQ_API_KEY not set in .env — LLM features disabled")
            return False
        logger.info("✓ Configuration loaded from .env")
        return True


if __name__ == "__main__":
    Config.validate()
    print(f"GROQ_API_KEY: {'***' + Config.GROQ_API_KEY[-4:] if Config.GROQ_API_KEY else 'NOT SET'}")
    print(f"GROQ_MODEL: {Config.GROQ_MODEL}")
    print(f"BACKEND: {Config.BACKEND_HOST}:{Config.BACKEND_PORT}")
    print(f"FRONTEND: {Config.FRONTEND_URL}")