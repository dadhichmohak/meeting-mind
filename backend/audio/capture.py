"""
Captures microphone and/or system loopback audio via sounddevice.

System audio (loopback) setup per OS:
  Windows — Enable "Stereo Mix" in Sound settings, or install VB-Cable
  Linux   — pactl load-module module-loopback latency_msec=1
  macOS   — Install BlackHole: https://existential.audio/blackhole/
"""
import threading
import numpy as np
import sounddevice as sd
from loguru import logger

from backend.audio.stream import AudioStreamQueue
from backend.audio.vad import VoiceActivityDetector


class AudioCapture:
    def __init__(
        self,
        stream_queue: AudioStreamQueue,
        vad: VoiceActivityDetector | None = None,
        sample_rate: int = 16000,
        channels: int = 1,
        chunk_duration_ms: int = 500,
        mic_device: int | None = None,
        loopback_device: int | None = None,
    ):
        self.queue = stream_queue
        self.vad = vad
        self.sample_rate = sample_rate
        self.chunk_size = int(sample_rate * chunk_duration_ms / 1000)
        self.mic_device = mic_device
        self.loopback_device = loopback_device

        self._mic_stream: sd.InputStream | None = None
        self._loop_stream: sd.InputStream | None = None
        self._running = False
        self._lock = threading.Lock()

    @staticmethod
    def list_devices() -> list[dict]:
        out = []
        for i, d in enumerate(sd.query_devices()):
            out.append({
                "index": i,
                "name": d["name"],
                "inputs": d["max_input_channels"],
                "outputs": d["max_output_channels"],
                "default_sr": int(d["default_samplerate"]),
            })
        return out

    def _callback(self, indata: np.ndarray, frames, time, status):
        if status:
            logger.debug(f"Audio status: {status}")
        chunk = indata[:, 0]  # mono
        if self.vad and not self.vad.is_speech(chunk):
            return
        self.queue.put(chunk)

    def _open_stream(self, device: int | None) -> sd.InputStream:
        return sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="float32",
            blocksize=self.chunk_size,
            device=device,
            callback=self._callback,
        )

    def start(self, mic: bool = True, loopback: bool = False):
        with self._lock:
            if self._running:
                return
            self._running = True

        if mic:
            self._mic_stream = self._open_stream(self.mic_device)
            self._mic_stream.start()
            logger.info(f"Mic capture started (device={self.mic_device})")

        if loopback:
            if self.loopback_device is None:
                logger.warning("No loopback device set — skipping system audio")
            else:
                self._loop_stream = self._open_stream(self.loopback_device)
                self._loop_stream.start()
                logger.info(f"Loopback capture started (device={self.loopback_device})")

    def stop(self):
        with self._lock:
            if not self._running:
                return
            self._running = False

        for s in [self._mic_stream, self._loop_stream]:
            if s:
                s.stop()
                s.close()
        self._mic_stream = None
        self._loop_stream = None
        logger.info("Audio capture stopped")

    @property
    def is_running(self) -> bool:
        return self._running