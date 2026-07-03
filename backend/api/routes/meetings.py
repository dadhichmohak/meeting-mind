"""
POST /meetings/start   — start capture + transcription
POST /meetings/stop    — stop and save transcript
GET  /meetings/status  — current session info
GET  /meetings/devices — list audio input devices
"""
import asyncio
import time
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel

from backend.config import Config
from backend.audio.capture import AudioCapture
from backend.audio.stream import AudioStreamQueue
from backend.audio.vad import VoiceActivityDetector
from backend.whisper.transcriber import Transcriber, TranscriptSegment
from backend.api.websocket import manager, push_segment, push_status
from backend.llm.groq_engine import GroqEngine
from backend.llm.analyzer import MeetingAnalyzer

router = APIRouter(prefix="/meetings", tags=["meetings"])


# ── Session state ────────────────────────────────────────────────────────────

class _Session:
    active: bool = False
    meeting_id: str = ""
    start_time: float = 0.0
    segments: list[TranscriptSegment] = []
    capture: AudioCapture | None = None
    transcriber: Transcriber | None = None
    _loop: asyncio.AbstractEventLoop | None = None

    def reset(self):
        self.active = False
        self.meeting_id = ""
        self.start_time = 0.0
        self.segments = []
        self.capture = None
        self.transcriber = None
        self._loop = None


session = _Session()


# ── Request / Response models ────────────────────────────────────────────────

class StartRequest(BaseModel):
    model_config = {"protected_namespaces": ()}   # ← add this line
    mic_device: int | None = None
    loopback_device: int | None = None
    enable_loopback: bool = False
    model_size: str = "base"
    language: str = "en"
    vad_enabled: bool = True


class StopResponse(BaseModel):
    meeting_id: str
    duration_seconds: float
    segment_count: int
    transcript_path: str


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/devices")
async def list_devices():
    return {"devices": AudioCapture.list_devices()}


@router.get("/status")
async def get_status():
    if not session.active:
        return {"active": False}
    return {
        "active": True,
        "meeting_id": session.meeting_id,
        "duration_seconds": round(time.time() - session.start_time, 1),
        "segment_count": len(session.segments),
    }


@router.post("/start")
async def start_meeting(req: StartRequest):
    if session.active:
        return {"error": "Meeting already active", "meeting_id": session.meeting_id}

    session.meeting_id = str(uuid.uuid4())[:8].upper()
    session.start_time = time.time()
    session.segments = []
    session._loop = asyncio.get_event_loop()

    q = AudioStreamQueue(sample_rate=16000)

    vad = None
    if req.vad_enabled:
        vad = VoiceActivityDetector()
        vad.load()

    session.capture = AudioCapture(
        stream_queue=q,
        vad=vad,
        mic_device=req.mic_device,
        loopback_device=req.loopback_device,
    )

    def on_segment(seg: TranscriptSegment):
        session.segments.append(seg)
        asyncio.run_coroutine_threadsafe(
            push_segment(seg.to_dict()),
            session._loop,
        )

    session.transcriber = Transcriber(
        stream_queue=q,
        model_size=req.model_size,
        language=req.language,
        on_segment=on_segment,
    )
    session.transcriber.load_model()
    session.capture.start(mic=True, loopback=req.enable_loopback)
    session.transcriber.start()
    session.active = True

    await push_status("recording", session.meeting_id)
    logger.info(f"Meeting {session.meeting_id} started")
    return {"meeting_id": session.meeting_id, "status": "recording"}


@router.post("/stop")
async def stop_meeting():
    if not session.active:
        return {"error": "No active meeting"}

    session.capture.stop()
    session.transcriber.stop()

    duration = round(time.time() - session.start_time, 1)
    mid = session.meeting_id
    segs = session.segments[:]

    # Build raw transcript text
    raw_transcript = "\n".join([f"{seg.text}" for seg in segs])

    # Analyze with Groq LLM
    # Analyze with Groq LLM (if API key is available)
    analysis = {}
    if len(segs) > 0 and Config.GROQ_API_KEY:  # only analyze if we have segments AND API key
        try:
            llm = GroqEngine()
            analyzer = MeetingAnalyzer(llm)
            analysis = analyzer.analyze(raw_transcript)
            logger.info(f"Analysis complete: {list(analysis.keys())}")
        except Exception as e:
            logger.warning(f"Analysis failed: {e}")
            analysis = {"error": str(e)}
    elif len(segs) == 0:
        analysis = {"error": "No speech detected in meeting"}
    else:
        analysis = {"info": "GROQ_API_KEY not set — skipping analysis. Set it in .env to enable."}

    # Save transcript with analysis
    path = _save_transcript(mid, segs, duration, analysis)

    await push_status("stopped", mid)
    logger.info(f"Meeting {mid} stopped — {len(segs)} segments, {duration}s, saved to {path}")

    result = StopResponse(
        meeting_id=mid,
        duration_seconds=duration,
        segment_count=len(segs),
        transcript_path=path,
    )
    session.reset()
    return {**result.model_dump(), "analysis": analysis}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _save_transcript(mid: str, segments: list[TranscriptSegment], duration: float) -> str:
    Path("meetings").mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"meetings/{ts}_{mid}.md"

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Meeting — {mid}\n")
        f.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Duration:** {duration}s\n\n---\n\n")
        for seg in segments:
            m, s = divmod(int(seg.start), 60)
            speaker = f"**{seg.speaker}:** " if seg.speaker else ""
            f.write(f"`{m:02d}:{s:02d}` {speaker}{seg.text}\n\n")

    return path