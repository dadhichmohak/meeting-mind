"""
Silero VAD — processes audio in required 512-sample windows at 16kHz.
"""
import numpy as np
import torch
from loguru import logger


class VoiceActivityDetector:
    def __init__(
        self,
        sample_rate: int = 16000,
        threshold: float = 0.5,
        min_speech_ms: int = 250,
        min_silence_ms: int = 500,
    ):
        self.sample_rate = sample_rate
        self.threshold = threshold
        self._window = 512 if sample_rate == 16000 else 256
        self._min_speech = int(min_speech_ms * sample_rate / 1000)
        self._min_silence = int(min_silence_ms * sample_rate / 1000)
        self._model = None
        self._speaking = False
        self._speech_acc = 0
        self._silence_acc = 0
        self._leftover = np.array([], dtype=np.float32)

    def load(self):
        logger.info("Loading Silero VAD...")
        model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            trust_repo=True,
        )
        self._model = model
        logger.info("VAD ready")

    def is_speech(self, chunk: np.ndarray) -> bool:
        if self._model is None:
            return True

        # Accumulate with any leftover from last call
        audio = np.concatenate([self._leftover, chunk])
        speech_found = False

        # Process in exact 512-sample windows
        i = 0
        while i + self._window <= len(audio):
            window = audio[i : i + self._window]
            t = torch.from_numpy(window).float().unsqueeze(0)
            with torch.no_grad():
                prob = self._model(t, self.sample_rate).item()

            if prob >= self.threshold:
                self._speech_acc += self._window
                self._silence_acc = 0
                if self._speech_acc >= self._min_speech:
                    self._speaking = True
                speech_found = True
            else:
                self._silence_acc += self._window
                self._speech_acc = 0
                if self._silence_acc >= self._min_silence:
                    self._speaking = False

            i += self._window

        # Keep remainder for next call
        self._leftover = audio[i:]
        return self._speaking