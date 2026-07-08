"""
MetMind — Backend entry point.
Reads configuration from .env file.

Run with: python -m backend.main
         (from the project root, with venv active)
"""
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from pathlib import Path
import yaml
import uvicorn
from loguru import logger

from backend.config import Config
from backend.utils.logger import setup_logger
from backend.database import init_db

setup_logger()

init_db()


def main():
    # Validate config
    if not Config.validate():
        logger.warning("Config validation failed — proceeding anyway")

    # Create required directories
    for d in ["meetings", "logs", "exports"]:
        Path(d).mkdir(exist_ok=True)

    logger.info(f"Starting MetMind on {Config.BACKEND_HOST}:{Config.BACKEND_PORT}")
    logger.info(f"Groq model: {Config.GROQ_MODEL}")
    logger.info(f"Frontend URL: {Config.FRONTEND_URL}")

    uvicorn.run(
        "backend.api.app:app",
        host=Config.BACKEND_HOST,
        port=Config.BACKEND_PORT,
        reload=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()