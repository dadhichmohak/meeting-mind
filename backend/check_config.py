"""
Helper script to validate .env configuration.
Run: python -m backend.check_config
"""
import sys
from backend.config import Config
from backend.llm.groq_engine import GroqEngine
from loguru import logger

logger.remove()
logger.add(sys.stderr, format="<level>{level: <8}</level> | {message}")


def main():
    print("\n=== MeetingMind AI Configuration Check ===\n")

    # Check basic config
    print(f"GROQ_API_KEY: {'SET ✓' if Config.GROQ_API_KEY else 'NOT SET ✗'}")
    if Config.GROQ_API_KEY:
        print(f"  (last 4 chars: ...{Config.GROQ_API_KEY[-4:]})")
    print(f"GROQ_MODEL: {Config.GROQ_MODEL}")
    print(f"BACKEND: {Config.BACKEND_HOST}:{Config.BACKEND_PORT}")
    print(f"FRONTEND: {Config.FRONTEND_URL}")

    # Health check Groq
    if Config.GROQ_API_KEY:
        print("\nChecking Groq API connectivity...")
        engine = GroqEngine()
        if engine.health_check():
            print("  ✓ Groq API is reachable and working")
        else:
            print("  ✗ Groq API check failed — check your API key")
    else:
        print("\n⚠️  GROQ_API_KEY not set — LLM features will be disabled")

    print("\n✓ Configuration check complete\n")


if __name__ == "__main__":
    main()