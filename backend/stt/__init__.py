"""
Speech-to-text engine abstraction.

Supported engines:
  - "groq"  — Groq Whisper API (cloud, fast, real-time)
  - "whisper" — Local faster-whisper (offline, slower on CPU)
"""
from backend.config import Config

STT_ENGINE = Config.STT_ENGINE
