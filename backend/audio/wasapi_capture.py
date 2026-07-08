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


class WASAPICapture:
    """Captures audio via WASAPI loopback (all system audio)."""

    def __init__(
        self,
        stream_queue: AudioStreamQueue,
        sample_rate: int = 16000,
        chunk_duration_ms: int = 500,
    ):
        self.queue = stream_queue
        self.sample_rate = sample_rate
        self.chunk_size = int(sample_rate * chunk_duration_ms / 1000)
        # Device-native rate/channels are discovered in start(); until then we
        # assume stereo (most loopback devices are 2-channel) so the first
        # callback deinterleaves correctly even if start() failed.
        self._device_rate: int = sample_rate
        self._channels: int = 2
        self._stream = None
        self._p = None
        self._running = False
        self._lock = threading.Lock()

    def _to_mono(self, audio: np.ndarray) -> np.ndarray:
        """Deinterleave and average multi-channel audio down to mono."""
        if self._channels <= 1:
            return audio
        if audio.shape[0] % self._channels != 0:
            # Truncate any partial frame so reshape is clean.
            audio = audio[: (audio.shape[0] // self._channels) * self._channels]
        if audio.shape[0] == 0:
            return audio
        return audio.reshape(-1, self._channels).mean(axis=1)

    def _resample(self, audio: np.ndarray) -> np.ndarray:
        """Resample from the device rate to the target (queue) rate via
        linear interpolation. Linear is adequate for 16 kHz ASR input."""
        src_rate = self._device_rate
        dst_rate = self.sample_rate
        if src_rate == dst_rate or audio.shape[0] == 0:
            return audio
        n_out = int(round(audio.shape[0] * dst_rate / src_rate))
        if n_out < 1:
            return audio
        x_old = np.linspace(0, audio.shape[0] - 1, num=audio.shape[0])
        x_new = np.linspace(0, audio.shape[0] - 1, num=n_out)
        return np.interp(x_new, x_old, audio).astype(np.float32)

    def _callback(self, in_data, frame_count, time_info, status):
        if status:
            logger.debug(f"WASAPI status: {status}")
        try:
            audio = np.frombuffer(in_data, dtype=np.int16).astype(np.float32) / 32768.0
            audio = self._to_mono(audio)
            audio = self._resample(audio)
            self.queue.put(audio)
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

            self._device_rate = int(device_info['defaultSampleRate'])
            self._channels = int(device_info.get('maxInputChannels', 2))
            self._stream = self._p.open(
                format=pyaudio.paInt16,
                channels=self._channels,
                rate=self._device_rate,
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
