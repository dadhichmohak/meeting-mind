"""
Abstract base class for STT engines.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
import numpy as np


@dataclass
class STTResult:
    """Single transcription segment."""
    text: str
    start: float
    end: float


class STTEngine(ABC):
    """Interface for speech-to-text engines."""

    @abstractmethod
    def load(self, model_name: str = "", language: str = "en") -> None:
        """Initialize/load the model. Called once at startup."""
        ...

    @abstractmethod
    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000,
                   language: str = "en", time_offset: float = 0.0) -> list[STTResult]:
        """Transcribe audio array and return segments."""
        ...

    @abstractmethod
    def transcribe_file(self, file_path: str, language: str = "en") -> tuple[list[STTResult], float]:
        """Transcribe an audio file. Returns (segments, duration_seconds)."""
        ...

    @abstractmethod
    def unload(self) -> None:
        """Release resources."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine name for logging."""
        ...
