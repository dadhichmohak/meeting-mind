"""
WASAPI loopback capture for recording system/app audio on Windows.
Works even when speaker volume is down — taps into the audio stream
before the volume control.

Requires: pip install pyaudiowpatch
"""
import threading
import numpy as np
from loguru import logger

from backend.audio.stream import AudioStreamQueue
from backend.audio.vad import VoiceActivityDetector


class WASAPICapture:
    """Captures audio via WASAPI loopback (all system audio)."""

    def __init__(
        self,
        stream_queue: AudioStreamQueue,
        vad: VoiceActivityDetector | None = None,
        sample_rate: int = 16000,
        chunk_duration_ms: int = 500,
    ):
        self.queue = stream_queue
        self.vad = vad
        self.sample_rate = sample_rate
        self.chunk_size = int(sample_rate * chunk_duration_ms / 1000)
        self._stream = None
        self._p = None
        self._running = False
        self._lock = threading.Lock()

    def _callback(self, in_data, frame_count, time_info, status):
        if status:
            logger.debug(f"WASAPI status: {status}")
        try:
            audio_np = np.frombuffer(in_data, dtype=np.int16).astype(np.float32) / 32768.0

            if audio_np.shape[0] % 2 == 0:
                audio_np = audio_np[::2]

            if self.queue.sample_rate != 48000:
                if len(audio_np) >= 3:
                    audio_np = audio_np[::3]

            if self.vad and not self.vad.is_speech(audio_np):
                return (None, 0)

            self.queue.put(audio_np)
        except Exception as e:
            logger.debug(f"WASAPI callback error: {e}")
        return (None, 0)

    def _find_loopback_device(self):
        """Find the default WASAPI loopback device."""
        import pyaudiowpatch as pyaudio

        p = pyaudio.PyAudio()

        try:
            loopback = p.get_default_wasapi_loopback()
            logger.info(f"Found WASAPI loopback: {loopback['name']}")
            return p, loopback
        except Exception as e:
            logger.warning(f"get_default_wasapi_loopback failed: {e}")

        # Fallback: search all devices for one with isLoopbackDevice
        try:
            for i in range(p.get_device_count()):
                info = p.get_device_info_by_index(i)
                if info.get('isLoopbackDevice', False):
                    logger.info(f"Found loopback device by scan: {info['name']}")
                    return p, info
        except Exception as e:
            logger.debug(f"Device scan failed: {e}")

        p.terminate()
        return None, None

    def start(self):
        with self._lock:
            if self._running:
                return
            self._running = True

        try:
            self._p, device_info = self._find_loopback_device()
            if not self._p or not device_info:
                logger.error("WASAPI loopback not available")
                self._running = False
                return

            import pyaudiowpatch as pyaudio

            self._stream = self._p.open(
                format=pyaudio.paInt16,
                channels=device_info.get('maxInputChannels', 2),
                rate=int(device_info['defaultSampleRate']),
                input=True,
                input_device_index=device_info['index'],
                frames_per_buffer=self.chunk_size,
                stream_callback=self._callback,
            )
            self._stream.start_stream()
            logger.info(f"WASAPI loopback started: {device_info.get('name', 'unknown')}")
        except Exception as e:
            logger.error(f"Failed to start WASAPI capture: {e}")
            self._running = False

    def stop(self):
        with self._lock:
            if not self._running:
                return
            self._running = False

        try:
            if self._stream:
                self._stream.stop_stream()
                self._stream.close()
            if self._p:
                self._p.terminate()
        except Exception as e:
            logger.warning(f"Error stopping WASAPI: {e}")
        self._stream = None
        self._p = None
        logger.info("WASAPI loopback stopped")

    @property
    def is_running(self) -> bool:
        return self._running
