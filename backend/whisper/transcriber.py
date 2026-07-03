"""
Pulls chunks from AudioStreamQueue, accumulates a rolling buffer,
transcribes every N seconds using faster-whisper, fires a callback
with each TranscriptSegment.
"""
import time
import threading
import numpy as np
from dataclasses import dataclass, asdict
from faster_whisper import WhisperModel
from loguru import logger

from backend.audio.stream import AudioStreamQueue


@dataclass
class TranscriptSegment:
    text: str
    start: float        # seconds since meeting start
    end: float
    speaker: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


class Transcriber:
    def __init__(
        self,
        stream_queue: AudioStreamQueue,
        model_size: str = "base",
        language: str = "en",
        device: str = "cpu",
        compute_type: str = "int8",
        buffer_duration_s: float = 5.0,
        on_segment=None,
    ):
        self.queue = stream_queue
        self.model_size = model_size
        self.language = language
        self.device = device
        self.compute_type = compute_type
        self.buffer_duration_s = buffer_duration_s
        self.on_segment = on_segment

        self._model: WhisperModel | None = None
        self._thread: threading.Thread | None = None
        self._running = False
        self._buffer: list[np.ndarray] = []
        self._buffer_samples = 0
        self._total_samples = 0
        self._target_samples = 0

    def load_model(self):
        logger.info(f"Loading Whisper '{self.model_size}' on {self.device}...")
        self._model = WhisperModel(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
        )
        self._target_samples = int(self.buffer_duration_s * self.queue.sample_rate)
        logger.info("Whisper ready")

    def _transcribe(self) -> list[TranscriptSegment]:
        if not self._buffer:
            return []
        audio = np.concatenate(self._buffer)
        offset = self._total_samples / self.queue.sample_rate

        segs, _ = self._model.transcribe(
            audio,
            language=self.language,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        results = []
        for s in segs:
            text = s.text.strip()
            if text:
                results.append(TranscriptSegment(
                    text=text,
                    start=round(offset + s.start, 2),
                    end=round(offset + s.end, 2),
                ))
        return results

    def _flush(self):
        segments = self._transcribe()
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
        if not self._model:
            raise RuntimeError("Call load_model() first")
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="transcriber")
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=15)