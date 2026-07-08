"""
Local STT engine using faster-whisper.
"""
import numpy as np
from loguru import logger
from faster_whisper import WhisperModel

from backend.stt.base import STTEngine, STTResult


class LocalSTT(STTEngine):
    """Local faster-whisper engine — works offline but slower on CPU."""

    def __init__(self):
        self._model: WhisperModel | None = None
        self._language: str = "en"

    @property
    def name(self) -> str:
        return "whisper-local"

    def load(self, model_name: str = "large-v3-turbo", language: str = "en") -> None:
        self._language = language
        logger.info(f"Loading local Whisper model '{model_name}'...")
        self._model = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
        )
        logger.info(f"Local Whisper ready: {model_name}")

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000,
                   language: str = "en", time_offset: float = 0.0) -> list[STTResult]:
        if not self._model or len(audio) == 0:
            return []

        lang = None if language in ("auto", None) else language
        segs, _ = self._model.transcribe(
            audio,
            language=lang,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 800},
        )

        results = []
        for s in segs:
            text = s.text.strip()
            if text:
                results.append(STTResult(
                    text=text,
                    start=round(max(0, time_offset + s.start), 2),
                    end=round(max(0, time_offset + s.end), 2),
                ))
        return results

    def transcribe_file(self, file_path: str, language: str = "en") -> tuple[list[STTResult], float]:
        if not self._model:
            raise RuntimeError("Call load() first")

        lang = None if language in ("auto", None) else language
        logger.info(f"Transcribing file: {file_path}")

        segments_gen, info = self._model.transcribe(
            file_path,
            language=lang,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 800},
        )

        results = []
        for seg in segments_gen:
            text = seg.text.strip()
            if text:
                results.append(STTResult(
                    text=text,
                    start=round(seg.start, 2),
                    end=round(seg.end, 2),
                ))

        logger.info(f"File transcription complete: {len(results)} segments, {info.duration:.1f}s audio")
        return results, info.duration

    def unload(self) -> None:
        self._model = None
