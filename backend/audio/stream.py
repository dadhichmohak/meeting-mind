"""
Thread-safe queue between the audio capture callback and the Whisper thread.
"""
import queue
import threading
import numpy as np
from loguru import logger


class AudioStreamQueue:
    def __init__(self, sample_rate: int = 16000, maxsize: int = 500):
        self.sample_rate = sample_rate
        self._q: queue.Queue = queue.Queue(maxsize=maxsize)
        self._lock = threading.Lock()
        self._dropped = 0

    def put(self, chunk: np.ndarray):
        try:
            self._q.put_nowait(chunk.copy())
        except queue.Full:
            # Drop oldest chunk to keep latest audio (FIFO eviction)
            try:
                self._q.get_nowait()
                self._q.put_nowait(chunk.copy())
            except queue.Empty:
                pass
            with self._lock:
                self._dropped += 1
            if self._dropped % 30 == 0:
                logger.warning(f"Queue full — {self._dropped} chunks dropped (oldest evicted)")

    def get(self, timeout: float = 1.0) -> np.ndarray | None:
        try:
            return self._q.get(timeout=timeout)
        except queue.Empty:
            return None

    def clear(self):
        while not self._q.empty():
            try:
                self._q.get_nowait()
            except queue.Empty:
                break

    @property
    def size(self) -> int:
        return self._q.qsize()