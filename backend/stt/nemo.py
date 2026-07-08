"""
NVIDIA NeMo Parakeet ASR — GPU-accelerated STT engine.
Requires: nemo_toolkit[asr] or nemo_toolkit + torch with CUDA
"""
import numpy as np
from loguru import logger

from backend.stt.base import STTEngine, STTResult


class NeMoSTT(STTEngine):
    """NVIDIA NeMo Parakeet — fastest local STT with GPU support."""

    MODEL_MAP = {
        "parakeet-tdt-0.6b": "nvidia/parakeet-tdt-0.6b-v2",
        "parakeet-ctc-0.6b": "nvidia/parakeet-ctc-0.6b-v1",
        "parakeet-enc-ctc-0.6b": "nvidia/parakeet-enc-ctc-0.6b",
        "canary-1b": "nvidia/canary-1b",
    }

    def __init__(self):
        self._model = None
        self._device: str = "cuda"

    @property
    def name(self) -> str:
        return "nemo-parakeet"

    def load(self, model_name: str = "parakeet-tdt-0.6b", language: str = "en") -> None:
        import torch

        if torch.cuda.is_available():
            self._device = "cuda"
            logger.info(f"NeMo: GPU detected — {torch.cuda.get_device_name(0)}")
        else:
            self._device = "cpu"
            logger.warning("NeMo: No GPU found — falling back to CPU (will be slow)")

        nemo_model = self.MODEL_MAP.get(model_name, model_name)
        logger.info(f"Loading NeMo model '{nemo_model}' on {self._device}...")

        try:
            from nemo.collections.asr.models import ASRModel
            self._model = ASRModel.from_pretrained(nemo_model)
            self._model = self._model.to(self._device)
            self._model.eval()
            logger.info(f"NeMo ready: {nemo_model}")
        except ImportError:
            raise RuntimeError(
                "nemo_toolkit not installed. Run:\n"
                "  pip install nemo_toolkit[asr]\n"
                "  # or for CPU-only:\n"
                "  pip install nemo_toolkit\n"
            )

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000,
                   language: str = "en", time_offset: float = 0.0) -> list[STTResult]:
        if self._model is None or len(audio) == 0:
            return []

        import torch

        # NeMo expects float32 audio
        audio = audio.astype(np.float32)

        # Resample to 16kHz if needed (NeMo models expect 16kHz)
        # (audio is already 16kHz from our pipeline)

        # Add batch dimension
        audio_tensor = torch.from_numpy(audio).unsqueeze(0).to(self._device)

        try:
            with torch.no_grad():
                # Use transcribe method which handles chunking internally
                results = self._model.transcribe(
                    [audio_tensor.squeeze(0).cpu().numpy()],
                    batch_size=1,
                )
        except Exception as e:
            logger.error(f"NeMo transcription failed: {e}")
            return []

        # Parse results — NeMo returns list of text strings
        stt_results = []
        for text in results:
            if text and text.strip():
                # NeMo doesn't always return word-level timestamps
                # Estimate end time from audio length
                duration = len(audio) / sample_rate
                stt_results.append(STTResult(
                    text=text.strip(),
                    start=round(time_offset, 2),
                    end=round(time_offset + duration, 2),
                ))

        return stt_results

    def transcribe_file(self, file_path: str, language: str = "en") -> tuple[list[STTResult], float]:
        if self._model is None:
            raise RuntimeError("Call load() first")

        import torchaudio

        logger.info(f"Transcribing file via NeMo: {file_path}")

        try:
            waveform, sr = torchaudio.load(file_path)

            # Resample to 16kHz if needed
            if sr != 16000:
                resampler = torchaudio.transforms.Resample(sr, 16000)
                waveform = resampler(waveform)

            # Convert to mono if stereo
            if waveform.shape[0] > 1:
                waveform = waveform.mean(dim=0, keepdim=True)

            audio_np = waveform.squeeze(0).numpy().astype(np.float32)
            duration = len(audio_np) / 16000

            with torch.no_grad():
                results = self._model.transcribe(
                    [audio_np],
                    batch_size=1,
                )

            stt_results = []
            for text in results:
                if text and text.strip():
                    stt_results.append(STTResult(
                        text=text.strip(),
                        start=0.0,
                        end=round(duration, 2),
                    ))

            logger.info(f"NeMo file transcription complete: {len(stt_results)} segments, {duration:.1f}s")
            return stt_results, duration

        except Exception as e:
            raise RuntimeError(f"NeMo file transcription failed: {e}")

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
