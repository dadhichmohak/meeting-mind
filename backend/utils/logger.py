import sys
from pathlib import Path
from loguru import logger


def setup_logger(level: str = "INFO"):
    Path("logs").mkdir(exist_ok=True)
    logger.remove()
    logger.add(
        sys.stderr,
        format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | <cyan>{name}</cyan> — {message}",
        level=level,
        colorize=True,
    )
    logger.add(
        "logs/metmind.log",
        rotation="10 MB",
        retention="7 days",
        level="DEBUG",
    )
    return logger