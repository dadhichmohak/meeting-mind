"""
Pulls chunks from AudioStreamQueue, preprocesses audio, accumulates
a rolling buffer, transcribes via STT engine, fires a callback
with each TranscriptSegment.

Uses overlapping context between chunks to avoid skipping text
at boundaries — the last `overlap_duration_s` of audio is carried
over to the next transcription batch.
"""
import threading
import numpy as np
from dataclasses import dataclass, asdict
from loguru import logger

from backend.audio.stream import AudioStreamQueue
from backend.stt.base import STTEngine, STTResult


@dataclass
class TranscriptSegment:
    text: str
    start: float
    end: float
    speaker: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


class AudioPreprocessor:
    """Cleans audio before Whisper: high-pass, normalize, noise gate."""

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        # 2nd-order Butterworth high-pass at 80 Hz — removes rumble/hum
        self._hp_b = np.array([0.9723, -1.9446, 0.9723], dtype=np.float64)
        self._hp_a = np.array([1.0, -1.9446, 0.9449], dtype=np.float64)
        self._hp_x = np.zeros(2, dtype=np.float64)
        self._hp_y = np.zeros(2, dtype=np.float64)

    def process(self, audio: np.ndarray) -> np.ndarray:
        audio = self._highpass(audio)
        audio = self._normalize(audio)
        audio = self._noise_gate(audio)
        return audio.astype(np.float32)

    def _highpass(self, audio: np.ndarray) -> np.ndarray:
        """2nd-order IIR high-pass filter with state continuity."""
        x = audio.astype(np.float64)
        y = np.zeros_like(x)
        for i in range(len(x)):
            y[i] = (
                self._hp_b[0] * x[i]
                + self._hp_b[1] * self._hp_x[0]
                + self._hp_b[2] * self._hp_x[1]
                - self._hp_a[1] * self._hp_y[0]
                - self._hp_a[2] * self._hp_y[1]
            )
            self._hp_x[1] = self._hp_x[0]
            self._hp_x[0] = x[i]
            self._hp_y[1] = self._hp_y[0]
            self._hp_y[0] = y[i]
        return y

    def _normalize(self, audio: np.ndarray) -> np.ndarray:
        """Peak-normalize to 0.9 peak amplitude."""
        peak = np.max(np.abs(audio))
        if peak > 1e-6:
            audio = audio * (0.9 / peak)
        return audio

    def _noise_gate(self, audio: np.ndarray) -> np.ndarray:
        """Zero out samples below noise floor (RMS * 2)."""
        rms = np.sqrt(np.mean(audio ** 2))
        threshold = rms * 2.0
        audio[np.abs(audio) < threshold] = 0.0
        return audio


class Transcriber:
    def __init__(
        self,
        stream_queue: AudioStreamQueue,
        stt_engine: STTEngine,
        language: str = "en",
        buffer_duration_s: float = 2.0,
        overlap_duration_s: float = 1.5,
        on_segment=None,
    ):
        self.queue = stream_queue
        self.stt = stt_engine
        self.language = language
        self.buffer_duration_s = buffer_duration_s
        self.overlap_duration_s = overlap_duration_s
        self.on_segment = on_segment

        self._thread: threading.Thread | None = None
        self._running = False
        self._buffer: list[np.ndarray] = []
        self._buffer_samples = 0
        self._total_samples = 0
        self._target_samples = 0
        self._overlap_samples = 0
        self._overlap_buffer: np.ndarray = np.array([], dtype=np.float32)
        self._preprocessor = AudioPreprocessor(self.queue.sample_rate)

    def load_model(self, model_name: str = ""):
        logger.info(f"Loading STT engine: {self.stt.name}...")
        self.stt.load(model_name, self.language)
        self._target_samples = int(self.buffer_duration_s * self.queue.sample_rate)
        self._overlap_samples = int(self.overlap_duration_s * self.queue.sample_rate)
        logger.info(
            f"STT ready ({self.stt.name}, buffer={self.buffer_duration_s}s, "
            f"overlap={self.overlap_duration_s}s, "
            f"effective latency={self.buffer_duration_s - self.overlap_duration_s:.1f}s)"
        )

    def _transcribe(self, audio: np.ndarray, time_offset: float) -> list[TranscriptSegment]:
        if len(audio) == 0:
            return []

        results = self.stt.transcribe(
            audio,
            sample_rate=self.queue.sample_rate,
            language=self.language,
            time_offset=time_offset,
        )

        return [
            TranscriptSegment(text=r.text, start=r.start, end=r.end)
            for r in results
        ]

    def _flush(self):
        if not self._buffer:
            return

        # Drop stale queued audio — always process latest
        queued = self.queue.size
        if queued > 0:
            self.queue.clear()
            logger.debug(f"Cleared {queued} stale chunks from queue")

        audio = np.concatenate(self._buffer)

        # Prepend overlap from previous chunk for context
        if len(self._overlap_buffer) > 0:
            audio_with_overlap = np.concatenate([self._overlap_buffer, audio])
            overlap_offset = (self._total_samples - len(self._overlap_buffer)) / self.queue.sample_rate
        else:
            audio_with_overlap = audio
            overlap_offset = None

        # Preprocess: high-pass, normalize, noise gate
        audio_with_overlap = self._preprocessor.process(audio_with_overlap)

        segments = self._transcribe(audio_with_overlap, overlap_offset or (self._total_samples / self.queue.sample_rate))

        # Skip segments that fall in the overlap region (already transcribed)
        if overlap_offset is not None:
            new_audio_start = self._total_samples / self.queue.sample_rate
            segments = [s for s in segments if s.start >= new_audio_start]

        # Save the tail of this chunk as overlap for the next batch
        if len(audio) > self._overlap_samples:
            self._overlap_buffer = audio[-self._overlap_samples:].copy()
        else:
            self._overlap_buffer = audio.copy()

        # Advance total by the NEW samples only (not overlap)
        self._total_samples += self._buffer_samples
        self._buffer = []
        self._buffer_samples = 0

        for seg in segments:
            logger.debug(f"[{seg.start:.1f}s] {seg.text}")
            if self.on_segment:
                self.on_segment(seg)

    def _run(self):
        logger.info("Transcriber thread running")
        while self._running:
            chunk = self.queue.get(timeout=1.0)
            if chunk is None:
                if self._buffer:
                    self._flush()
                continue
            self._buffer.append(chunk)
            self._buffer_samples += len(chunk)
            if self._buffer_samples >= self._target_samples:
                self._flush()
        if self._buffer:
            self._flush()
        logger.info("Transcriber thread stopped")

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="transcriber")
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=15)
