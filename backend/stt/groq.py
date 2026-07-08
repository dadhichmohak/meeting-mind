"""
Groq Whisper API — cloud-based STT, real-time speed.
"""
import io
import struct
import numpy as np
from loguru import logger

from backend.stt.base import STTEngine, STTResult


class GroqSTT(STTEngine):
    """Groq Whisper API — fast cloud transcription with free tier."""

    API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
    MODEL = "whisper-large-v3-turbo"

    def __init__(self, api_key: str = ""):
        self._api_key = api_key
        self._loaded = False

    @property
    def name(self) -> str:
        return "groq-whisper"

    def load(self, model_name: str = "", language: str = "en") -> None:
        if not self._api_key:
            raise RuntimeError("GROQ_API_KEY required for Groq STT engine")
        self._loaded = True
        logger.info(f"Groq STT ready (model={self.MODEL})")

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000,
                   language: str = "en", time_offset: float = 0.0) -> list[STTResult]:
        if not self._loaded or len(audio) == 0:
            return []

        try:
            import httpx
        except ImportError:
            logger.error("httpx not installed — run: pip install httpx")
            return []

        # Convert numpy float32 audio to WAV in memory
        wav_bytes = self._audio_to_wav(audio, sample_rate)

        # Groq uses OpenAI-compatible endpoint
        lang = "" if language in ("auto", None) else language

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    self.API_URL,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    files={"file": ("audio.wav", wav_bytes, "audio/wav")},
                    data={
                        "model": self.MODEL,
                        "response_format": "verbose_json",
                        **({"language": lang} if lang else {}),
                    },
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Groq STT HTTP error: {e.response.status_code} — {e.response.text[:200]}")
            return []
        except Exception as e:
            logger.error(f"Groq STT request failed: {e}")
            return []

        # Parse response — verbose_json returns segments with timestamps
        results = []
        text = data.get("text", "").strip()
        if not text:
            return []

        # If verbose_json, use segments
        if "segments" in data:
            for seg in data["segments"]:
                t = seg.get("text", "").strip()
                if t:
                    results.append(STTResult(
                        text=t,
                        start=round(max(0, time_offset + seg.get("start", 0.0)), 2),
                        end=round(max(0, time_offset + seg.get("end", 0.0)), 2),
                    ))
        else:
            # Fallback: single segment with full text
            results.append(STTResult(
                text=text,
                start=round(time_offset, 2),
                end=round(time_offset + len(audio) / sample_rate, 2),
            ))

        return results

    def transcribe_file(self, file_path: str, language: str = "en") -> tuple[list[STTResult], float]:
        if not self._loaded:
            raise RuntimeError("Call load() first")

        try:
            import httpx
        except ImportError:
            raise RuntimeError("httpx not installed — run: pip install httpx")

        lang = "" if language in ("auto", None) else language
        logger.info(f"Transcribing file via Groq: {file_path}")

        try:
            with httpx.Client(timeout=120.0) as client:
                with open(file_path, "rb") as f:
                    response = client.post(
                        self.API_URL,
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        files={"file": (file_path, f, "audio/wav")},
                        data={
                            "model": self.MODEL,
                            "response_format": "verbose_json",
                            **({"language": lang} if lang else {}),
                        },
                    )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Groq STT HTTP error: {e.response.status_code} — {e.response.text[:200]}")
        except Exception as e:
            raise RuntimeError(f"Groq STT request failed: {e}")

        # Parse response
        results = []
        text = data.get("text", "").strip()
        duration = data.get("duration", 0.0)

        if not text:
            return [], duration

        if "segments" in data:
            for seg in data["segments"]:
                t = seg.get("text", "").strip()
                if t:
                    results.append(STTResult(
                        text=t,
                        start=round(seg.get("start", 0.0), 2),
                        end=round(seg.get("end", 0.0), 2),
                    ))
        else:
            results.append(STTResult(
                text=text,
                start=0.0,
                end=round(duration, 2),
            ))

        logger.info(f"File transcription complete: {len(results)} segments, {duration:.1f}s audio")
        return results, duration

    def unload(self) -> None:
        self._loaded = False

    @staticmethod
    def _audio_to_wav(audio: np.ndarray, sample_rate: int) -> bytes:
        """Convert numpy float32 array to WAV bytes."""
        # Ensure float32 and normalize
        audio = audio.astype(np.float32)
        peak = np.max(np.abs(audio))
        if peak > 1e-6:
            audio = audio * (0.9 / peak)

        # Convert to int16
        audio_int16 = (audio * 32767).astype(np.int16)

        buf = io.BytesIO()
        num_channels = 1
        bits_per_sample = 16
        byte_rate = sample_rate * num_channels * bits_per_sample // 8
        block_align = num_channels * bits_per_sample // 8
        data_size = len(audio_int16) * block_align

        # RIFF header
        buf.write(b"RIFF")
        buf.write(struct.pack("<I", 36 + data_size))
        buf.write(b"WAVE")

        # fmt chunk
        buf.write(b"fmt ")
        buf.write(struct.pack("<I", 16))  # chunk size
        buf.write(struct.pack("<H", 1))   # PCM
        buf.write(struct.pack("<H", num_channels))
        buf.write(struct.pack("<I", sample_rate))
        buf.write(struct.pack("<I", byte_rate))
        buf.write(struct.pack("<H", block_align))
        buf.write(struct.pack("<H", bits_per_sample))

        # data chunk
        buf.write(b"data")
        buf.write(struct.pack("<I", data_size))
        buf.write(audio_int16.tobytes())

        return buf.getvalue()
