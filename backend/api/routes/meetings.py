"""
POST /meetings/start   — start capture + transcription
POST /meetings/stop    — stop and save transcript
GET  /meetings/status  — current session info
GET  /meetings/devices — list audio input devices
"""
import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from backend.config import Config
from backend.database import SessionLocal, init_db
from backend.models import Meeting, TranscriptSegment as TranscriptSegmentRow, Note
from backend.audio.capture import AudioCapture
from backend.audio.stream import AudioStreamQueue
from backend.audio.vad import VoiceActivityDetector
from backend.audio.apps import list_audio_apps, list_input_devices, list_output_devices
from backend.whisper.transcriber import Transcriber, TranscriptSegment
from backend.api.websocket import manager, push_segment, push_status
from backend.llm.groq_engine import GroqEngine
from backend.llm.analyzer import MeetingAnalyzer

# Try importing WASAPI capture (Windows only)
try:
    from backend.audio.wasapi_capture import WASAPICapture
    HAS_WASAPI = True
except ImportError:
    HAS_WASAPI = False

router = APIRouter(prefix="/meetings", tags=["meetings"])

init_db()


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
    model_config = {"protected_namespaces": ()}
    title: str | None = None
    mic_device: int | None = None
    loopback_device: int | None = None
    enable_loopback: bool = False
    use_wasapi: bool = True
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
    return {
        "devices": AudioCapture.list_devices(),
        "apps": list_audio_apps(),
        "input_devices": list_input_devices(),
        "output_devices": list_output_devices(),
        "wasapi_available": HAS_WASAPI,
    }


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


@router.post("/reset")
async def force_reset():
    """Force-reset stuck session state."""
    session.reset()
    return {"status": "reset", "message": "Session cleared"}


@router.get("/list")
async def list_meetings(limit: int = 50, offset: int = 0):
    """List past meetings (newest first). For the future history page."""
    with SessionLocal() as db:
        rows = (
            db.query(Meeting)
            .order_by(Meeting.started_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
        return {
            "meetings": [
                {
                    "id": m.id,
                    "title": m.title,
                    "status": m.status,
                    "started_at": m.started_at.isoformat() if m.started_at else None,
                    "duration_seconds": m.duration_seconds,
                    "segment_count": len(m.segments),
                }
                for m in rows
            ]
        }


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str):
    """Fetch a single meeting with its full transcript + analysis."""
    with SessionLocal() as db:
        m = db.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(status_code=404, detail="Meeting not found")
        return {
            "id": m.id,
            "title": m.title,
            "status": m.status,
            "started_at": m.started_at.isoformat() if m.started_at else None,
            "ended_at": m.ended_at.isoformat() if m.ended_at else None,
            "duration_seconds": m.duration_seconds,
            "analysis": json.loads(m.analysis) if m.analysis else None,
            "segments": [
                {
                    "sequence": s.sequence,
                    "text": s.text,
                    "speaker": s.speaker,
                    "start_sec": s.start_sec,
                    "end_sec": s.end_sec,
                }
                for s in m.segments
            ],
        }


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """Delete a meeting and its transcript + analysis."""
    with SessionLocal() as db:
        m = db.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(status_code=404, detail="Meeting not found")
        db.delete(m)
        db.commit()

    # Also delete the markdown file if it exists
    import glob as globmod
    for f in globmod.glob(f"meetings/*_{meeting_id}.md"):
        try:
            Path(f).unlink()
            logger.info(f"Deleted transcript file: {f}")
        except Exception as e:
            logger.warning(f"Failed to delete {f}: {e}")

    return {"status": "deleted", "meeting_id": meeting_id}


@router.post("/start")
async def start_meeting(req: StartRequest):
    if session.active:
        return {"error": "Meeting already active", "meeting_id": session.meeting_id}

    session.meeting_id = str(uuid.uuid4())[:8].upper()
    session.start_time = time.time()
    session.segments = []
    session._loop = asyncio.get_event_loop()

    # Persist the meeting row
    with SessionLocal() as db:
        db.add(Meeting(
            id=session.meeting_id,
            title=req.title,
            status="recording",
            started_at=datetime.now(timezone.utc),
        ))
        db.commit()

    q = AudioStreamQueue(sample_rate=16000)

    vad = None
    if req.vad_enabled:
        vad = VoiceActivityDetector()
        vad.load()

    # Use WASAPI loopback for system audio (works even when volume is down)
    wasapi = None
    if req.enable_loopback and req.use_wasapi and HAS_WASAPI:
        try:
            wasapi = WASAPICapture(
                stream_queue=q,
                vad=vad,
                sample_rate=16000,
            )
        except Exception as e:
            logger.warning(f"WASAPI init failed, falling back to sounddevice: {e}")

    session.capture = AudioCapture(
        stream_queue=q,
        vad=vad,
        mic_device=req.mic_device,
        loopback_device=req.loopback_device,
    )

    def on_segment(seg: TranscriptSegment):
        session.segments.append(seg)
        # Persist each segment as it arrives (separate session per write
        # so the Whisper thread never shares a session with the API).
        try:
            with SessionLocal() as db:
                db.add(TranscriptSegmentRow(
                    meeting_id=session.meeting_id,
                    sequence=len(session.segments),
                    text=seg.text,
                    speaker=seg.speaker,
                    start_sec=seg.start,
                    end_sec=seg.end,
                ))
                db.commit()
        except Exception as e:
            logger.warning(f"Failed to persist segment: {e}")
        asyncio.run_coroutine_threadsafe(
            push_segment(seg.to_dict()),
            session._loop,
        )

    session.transcriber = Transcriber(
        stream_queue=q,
        model_size=req.model_size,
        language=req.language,
        buffer_duration_s=3.0,
        on_segment=on_segment,
    )
    session.transcriber.load_model()

    # Start audio capture — prefer WASAPI loopback for system audio
    wasapi_started = False
    if wasapi and req.enable_loopback:
        session.capture.start(mic=True, loopback=False)  # mic only via sounddevice
        wasapi.start()  # system audio via WASAPI
        if wasapi.is_running:
            session._wasapi = wasapi
            wasapi_started = True
            logger.info("Using WASAPI loopback for system audio capture")
        else:
            logger.warning("WASAPI failed, falling back to sounddevice loopback")
            # Restart capture with loopback via sounddevice
            session.capture.stop()
            session.capture.start(mic=True, loopback=req.enable_loopback)
    else:
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

    mid = session.meeting_id
    segs = session.segments[:]
    duration = round(time.time() - session.start_time, 1)

    try:
        session.capture.stop()
        session.transcriber.stop()
        # Stop WASAPI if it was started
        wasapi = getattr(session, '_wasapi', None)
        if wasapi:
            wasapi.stop()
            session._wasapi = None
    except Exception as e:
        logger.warning(f"Error stopping capture/transcriber: {e}")

    # Build raw transcript text
    raw_transcript = "\n".join([f"{seg.text}" for seg in segs])

    # Analyze with Groq LLM (if API key is available)
    analysis = {}
    if len(segs) > 0 and Config.GROQ_API_KEY:
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

    # Save transcript with analysis (Markdown export artifact)
    path = ""
    try:
        path = _save_transcript(mid, segs, duration, analysis)
    except Exception as e:
        logger.warning(f"Failed to save transcript file: {e}")

    # Persist analysis + finalize the meeting row
    analysis_json = json.dumps(analysis, ensure_ascii=False) if analysis else None
    try:
        with SessionLocal() as db:
            meeting = db.get(Meeting, mid)
            if meeting:
                meeting.status = "completed"
                meeting.ended_at = datetime.now(timezone.utc)
                meeting.duration_seconds = duration
                meeting.analysis = analysis_json
                db.commit()
    except Exception as e:
        logger.warning(f"Failed to finalize meeting row: {e}")

    # ALWAYS reset session, even if something above failed
    session.reset()

    await push_status("stopped", mid)
    logger.info(f"Meeting {mid} stopped — {len(segs)} segments, {duration}s")

    result = StopResponse(
        meeting_id=mid,
        duration_seconds=duration,
        segment_count=len(segs),
        transcript_path=path,
    )
    return {**result.model_dump(), "analysis": analysis}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _save_transcript(mid: str, segments: list[TranscriptSegment], duration: float, analysis: dict = None) -> str:
    Path("meetings").mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"meetings/{ts}_{mid}.md"

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Meeting — {mid}\n")
        f.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Duration:** {duration}s\n\n---\n\n")

        # Write analysis/summary section if available
        if analysis and not analysis.get("error"):
            f.write("## Analysis\n\n")
            if analysis.get("summary"):
                f.write(f"### Executive Summary\n{analysis['summary']}\n\n")
            if analysis.get("decisions"):
                f.write("### Key Decisions\n")
                for d in analysis["decisions"]:
                    f.write(f"- {d}\n")
                f.write("\n")
            if analysis.get("action_items"):
                f.write("### Action Items\n")
                for a in analysis["action_items"]:
                    f.write(f"- {a}\n")
                f.write("\n")
            if analysis.get("questions"):
                f.write("### Open Questions\n")
                for q in analysis["questions"]:
                    f.write(f"- {q}\n")
                f.write("\n")
            if analysis.get("risks"):
                f.write("### Risks & Concerns\n")
                for r in analysis["risks"]:
                    f.write(f"- {r}\n")
                f.write("\n")
            if analysis.get("follow_ups"):
                f.write("### Follow-ups\n")
                for fu in analysis["follow_ups"]:
                    f.write(f"- {fu}\n")
                f.write("\n")
            f.write("---\n\n")

        # Write transcript
        f.write("## Transcript\n\n")
        for seg in segments:
            m, s = divmod(int(seg.start), 60)
            speaker = f"**{seg.speaker}:** " if seg.speaker else ""
            f.write(f"`{m:02d}:{s:02d}` {speaker}{seg.text}\n\n")

    return path