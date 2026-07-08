"""Tests for WASAPI capture helpers (no audio hardware required)."""
import numpy as np

from backend.audio.stream import AudioStreamQueue
from backend.audio.wasapi_capture import WASAPICapture


def _make_capture(device_rate=48000, channels=2):
    cap = WASAPICapture(stream_queue=AudioStreamQueue(sample_rate=16000))
    cap._device_rate = device_rate
    cap._channels = channels
    return cap


def test_to_mono_averages_channels():
    cap = _make_capture(channels=2)
    stereo = np.array([0.0, 1.0, 0.2, 0.4], dtype=np.float32)  # 2 frames x 2 ch
    mono = cap._to_mono(stereo)
    assert mono.shape[0] == 2
    assert abs(mono[0] - 0.5) < 1e-5
    assert abs(mono[1] - 0.3) < 1e-5


def test_to_mono_handles_partial_frame():
    cap = _make_capture(channels=2)
    stereo = np.array([0.0, 1.0, 0.2], dtype=np.float32)  # 3 samples -> 1 full frame
    mono = cap._to_mono(stereo)
    assert mono.shape[0] == 1


def test_resample_lowers_rate():
    cap = _make_capture(device_rate=48000, channels=2)
    sig = np.ones(4800, dtype=np.float32)
    out = cap._resample(sig)
    assert abs(len(out) - 1600) <= 2


def test_resample_same_rate_passthrough():
    cap = _make_capture(device_rate=16000)
    sig = np.ones(100, dtype=np.float32)
    out = cap._resample(sig)
    assert len(out) == 100


def test_resample_arbitrary_rate():
    cap = _make_capture(device_rate=44100)
    sig = np.ones(4410, dtype=np.float32)
    out = cap._resample(sig)
    assert abs(len(out) - 1600) <= 2
