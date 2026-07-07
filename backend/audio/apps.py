"""
Lists running applications that are producing audio on Windows.
Uses pycaw (Python Core Audio Windows) to enumerate audio sessions.
"""
from loguru import logger


def list_audio_apps() -> list[dict]:
    """
    Return list of apps currently producing audio.
    Each entry: {"pid": int, "name": str, "volume": float, "muted": bool}
    """
    try:
        from pycaw.pycaw import AudioUtilities

        sessions = AudioUtilities.GetAllSessions()
        apps = []
        for session in sessions:
            proc = session.Process
            if not proc:
                continue
            name = proc.name()
            if not name:
                continue
            try:
                vol = session.SimpleAudioVolume.GetMasterVolume()
                muted = bool(session.SimpleAudioVolume.GetMute())
                apps.append({
                    "pid": proc.pid,
                    "name": name,
                    "volume": round(vol, 2),
                    "muted": muted,
                    "peak": 0.0,
                })
            except Exception:
                pass
        return apps
    except ImportError:
        logger.debug("pycaw not installed — pip install pycaw")
        return []
    except Exception as e:
        logger.debug(f"Failed to list audio apps: {e}")
        return []


def list_output_devices() -> list[dict]:
    """List WASAPI output devices (speakers, headphones, etc.)."""
    try:
        import pyaudiowpatch as pyaudio
        p = pyaudio.PyAudio()
        devices = []
        for i in range(p.get_device_count()):
            info = p.get_device_info_by_index(i)
            if info.get('maxOutputChannels', 0) > 0:
                devices.append({
                    "index": i,
                    "name": info['name'],
                    "channels": info.get('maxOutputChannels', 0),
                    "sample_rate": int(info.get('defaultSampleRate', 44100)),
                })
        p.terminate()
        return devices
    except ImportError:
        import sounddevice as sd
        devices = []
        for i, d in enumerate(sd.query_devices()):
            if d["max_output_channels"] > 0:
                devices.append({
                    "index": i,
                    "name": d["name"],
                    "channels": d["max_output_channels"],
                    "sample_rate": int(d["default_samplerate"]),
                })
        return devices
    except Exception as e:
        logger.debug(f"Failed to list output devices: {e}")
        return []


def list_input_devices() -> list[dict]:
    """List audio input devices (mics)."""
    try:
        import sounddevice as sd
        devices = []
        for i, d in enumerate(sd.query_devices()):
            if d["max_input_channels"] > 0:
                devices.append({
                    "index": i,
                    "name": d["name"],
                    "channels": d["max_input_channels"],
                    "sample_rate": int(d["default_samplerate"]),
                })
        return devices
    except Exception as e:
        logger.debug(f"Failed to list input devices: {e}")
        return []
