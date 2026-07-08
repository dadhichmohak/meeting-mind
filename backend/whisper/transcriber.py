"""
Pulls chunks from AudioStreamQueue, accumulates a rolling buffer,
transcribes every N seconds using faster-whisper, fires a callback
with each TranscriptSegment.

Uses overlapping context between chunks to avoid skipping text
at boundaries — the last `overlap_duration_s` of audio is carried
over to the next transcription batch.
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
        overlap_duration_s: float = 1.5,
        on_segment=None,
    ):
        self.queue = stream_queue
        self.model_size = model_size
        self.language = language
        self.device = device
        self.compute_type = compute_type
        self.buffer_duration_s = buffer_duration_s
        self.overlap_duration_s = overlap_duration_s
        self.on_segment = on_segment

        self._model: WhisperModel | None = None
        self._thread: threading.Thread | None = None
        self._running = False
        self._buffer: list[np.ndarray] = []
        self._buffer_samples = 0
        self._total_samples = 0
        self._target_samples = 0
        self._overlap_samples = 0
        self._overlap_buffer: np.ndarray = np.array([], dtype=np.float32)

    def load_model(self):
        logger.info(f"Loading Whisper '{self.model_size}' on {self.device}...")
        self._model = WhisperModel(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
        )
        self._target_samples = int(self.buffer_duration_s * self.queue.sample_rate)
        self._overlap_samples = int(self.overlap_duration_s * self.queue.sample_rate)
        logger.info(f"Whisper ready (buffer={self.buffer_duration_s}s, overlap={self.overlap_duration_s}s)")

    # Map composite language codes to faster-whisper supported codes
    _LANG_MAP = {"hi-en": "hi"}

    def _transcribe(self, audio: np.ndarray, time_offset: float) -> list[TranscriptSegment]:
        if len(audio) == 0:
            return []

        whisper_lang = None if self.language in ("auto", None) else self._LANG_MAP.get(self.language, self.language)
        segs, _ = self._model.transcribe(
            audio,
            language=whisper_lang,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        results = []
        for s in segs:
            text = s.text.strip()
            if text:
                seg_start = time_offset + s.start
                seg_end = time_offset + s.end
                results.append(TranscriptSegment(
                    text=text,
                    start=round(max(0, seg_start), 2),
                    end=round(max(0, seg_end), 2),
                ))
        return results

    def _flush(self):
        if not self._buffer:
            return

        audio = np.concatenate(self._buffer)

        # Prepend overlap from previous chunk for context
        if len(self._overlap_buffer) > 0:
            audio_with_overlap = np.concatenate([self._overlap_buffer, audio])
            # The time offset accounts for the overlap being from the previous batch
            offset = (self._total_samples - len(self._overlap_buffer)) / self.queue.sample_rate
        else:
            audio_with_overlap = audio
            offset = self._total_samples / self.queue.sample_rate

        segments = self._transcribe(audio_with_overlap, offset)

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
        if not self._model:
            raise RuntimeError("Call load_model() first")
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="transcriber")
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=15)