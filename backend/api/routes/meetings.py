"""
POST /meetings/start   — start capture + transcription
POST /meetings/stop    — stop and save transcript
GET  /meetings/status  — current session info
GET  /meetings/devices — list audio input devices
GET  /meetings/search  — full-text search across meetings
PATCH /meetings/{id}   — edit meeting title / notes
"""
import asyncio
import json
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel
from typing import Optional

from backend.config import Config
from backend.database import SessionLocal, init_db
from backend.models import Meeting, TranscriptSegment as TranscriptSegmentRow, Note
from backend.audio.capture import AudioCapture
from backend.audio.stream import AudioStreamQueue
from backend.audio.apps import list_audio_apps, list_input_devices, list_output_devices
from backend.whisper.transcriber import Transcriber, TranscriptSegment
from backend.api.websocket import manager, push_segment, push_status
from backend.llm.groq_engine import GroqEngine
from backend.llm.analyzer import MeetingAnalyzer
from backend.utils.transcript import build_raw_transcript

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
    segments: list[TranscriptSegment] | None = None
    capture: AudioCapture | None = None
    transcriber: Transcriber | None = None
    _loop: asyncio.AbstractEventLoop | None = None
    _lock: threading.Lock = threading.Lock()
    _summary_language: str = "en"
    _groq_api_key: str | None = None

    def reset(self):
        with self._lock:
            self.active = False
            self.meeting_id = ""
            self.start_time = 0.0
            self.segments = None
            self.capture = None
            self.transcriber = None
            self._loop = None
            self._summary_language = "en"
            self._groq_api_key = None


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
    summary_language: str = "en"
    vad_enabled: bool = True
    groq_api_key: str | None = None


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
    with session._lock:
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


@router.get("/search")
async def search_meetings(q: str = "", limit: int = 20, meeting_id: str = ""):
    """Full-text search across meeting titles and transcript segments.
    If meeting_id provided, uses that meeting's transcript for LLM context.
    If no results found and query looks like a question, use LLM to answer."""
    if not q.strip():
        return {"results": [], "query": q}

    with SessionLocal() as db:
        # Search in meeting titles
        title_matches = (
            db.query(Meeting)
            .filter(Meeting.title.ilike(f"%{q}%"))
            .order_by(Meeting.started_at.desc())
            .limit(limit)
            .all()
        )
        title_ids = {m.id for m in title_matches}

        # Search in transcript segments
        segment_matches = (
            db.query(TranscriptSegmentRow)
            .filter(TranscriptSegmentRow.text.ilike(f"%{q}%"))
            .order_by(TranscriptSegmentRow.id.desc())
            .limit(limit * 3)
            .all()
        )

        # Group segments by meeting_id, preserving order
        seg_by_meeting: dict[str, list] = {}
        for seg in segment_matches:
            if seg.meeting_id not in seg_by_meeting:
                seg_by_meeting[seg.meeting_id] = []
            if len(seg_by_meeting[seg.meeting_id]) < 3:
                seg_by_meeting[seg.meeting_id].append({
                    "text": seg.text,
                    "start_sec": seg.start_sec,
                    "speaker": seg.speaker,
                })

        # Fetch full meeting objects for segment matches
        seg_meeting_ids = [mid for mid in seg_by_meeting if mid not in title_ids]
        seg_meetings = []
        if seg_meeting_ids:
            seg_meetings = (
                db.query(Meeting)
                .filter(Meeting.id.in_(seg_meeting_ids))
                .order_by(Meeting.started_at.desc())
                .limit(limit)
                .all()
            )

        # Combine results: title matches first, then segment matches
        results = []
        seen_ids = set()

        for m in title_matches:
            if m.id in seen_ids:
                continue
            seen_ids.add(m.id)
            results.append({
                "id": m.id,
                "title": m.title,
                "status": m.status,
                "started_at": m.started_at.isoformat() if m.started_at else None,
                "duration_seconds": m.duration_seconds,
                "segment_count": len(m.segments),
                "match_type": "title",
                "matched_segments": [],
            })

        for m in seg_meetings:
            if m.id in seen_ids:
                continue
            seen_ids.add(m.id)
            results.append({
                "id": m.id,
                "title": m.title,
                "status": m.status,
                "started_at": m.started_at.isoformat() if m.started_at else None,
                "duration_seconds": m.duration_seconds,
                "segment_count": len(m.segments),
                "match_type": "transcript",
                "matched_segments": seg_by_meeting.get(m.id, []),
            })

        # If no text matches found and query looks like a question, try LLM answer
        llm_answer = None
        is_question = "?" in q or q.lower().startswith(("what", "how", "why", "when", "where", "who", "which", "is ", "are ", "did ", "was ", "were "))
        transcript_parts = []
        if not results and is_question:
            # Priority 1: Use the specific meeting's transcript if provided
            if meeting_id:
                target_meeting = db.get(Meeting, meeting_id)
                if target_meeting:
                    segs = (
                        db.query(TranscriptSegmentRow)
                        .filter(TranscriptSegmentRow.meeting_id == meeting_id)
                        .order_by(TranscriptSegmentRow.sequence)
                        .all()
                    )
                    if segs:
                        text = " ".join(s.text for s in segs)
                        title = target_meeting.title or target_meeting.id
                        transcript_parts.append(f"[{title}]: {text}")

            # Priority 2: Also include recent meetings for broader context
            if len(transcript_parts) < 2:
                recent_meetings = (
                    db.query(Meeting)
                    .filter(Meeting.status == "completed")
                    .order_by(Meeting.started_at.desc())
                    .limit(5)
                    .all()
                )
                for m in recent_meetings:
                    if m.id == meeting_id:
                        continue  # skip if already added
                    segs = (
                        db.query(TranscriptSegmentRow)
                        .filter(TranscriptSegmentRow.meeting_id == m.id)
                        .order_by(TranscriptSegmentRow.sequence)
                        .all()
                    )
                    if segs:
                        text = " ".join(s.text for s in segs)
                        title = m.title or m.id
                        transcript_parts.append(f"[{title}]: {text}")

    # LLM call outside DB session to avoid holding connection open during network I/O
    if transcript_parts and not results:
        from backend.llm.groq_engine import GroqEngine
        llm = GroqEngine()
        if llm.health_check():
            combined = "\n\n".join(transcript_parts)
            system = (
                "You are a helpful meeting assistant. Answer the user's question "
                "based on the meeting transcripts provided. Be concise and factual. "
                "If the transcripts don't contain relevant information, say so."
            )
            user = f"Meeting transcripts:\n{combined}\n\nQuestion: {q}"
            llm_answer = llm.generate(user, system=system, temperature=0.3)

    return {"results": results[:limit], "query": q, "llm_answer": llm_answer}


class AskRequest(BaseModel):
    prompt: str
    transcript: str = ""
    groq_api_key: str | None = None


@router.post("/ask")
async def ask_about_meeting(req: AskRequest):
    """Send a prompt to the LLM with transcript context and return the response."""
    from backend.llm.groq_engine import GroqEngine

    llm = GroqEngine(api_key=req.groq_api_key or None)
    if not llm.health_check():
        return {"error": "LLM unavailable. Set GROQ_API_KEY in .env."}

    system = (
        "You are a helpful meeting assistant. "
        "Answer the user's question based on the meeting transcript provided. "
        "Be concise, factual, and reference specific points from the transcript. "
        "If the transcript doesn't contain relevant information, say so."
    )
    user = req.prompt
    if req.transcript:
        user = f"Meeting transcript:\n{req.transcript}\n\nQuestion: {req.prompt}"

    response = llm.generate(user, system=system, temperature=0.3)
    if response == "RATE_LIMIT_ERROR":
        return {"error": "API rate limit reached. Please wait a moment and try again."}
    if not response:
        return {"error": "LLM failed to respond"}
    return {"response": response}


class EditMeetingRequest(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None


@router.patch("/{meeting_id}")
async def edit_meeting(meeting_id: str, req: EditMeetingRequest):
    """Edit meeting title and/or notes."""
    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")

        if req.title is not None:
            meeting.title = req.title

        if req.notes is not None:
            # Upsert the note
            note = db.query(Note).filter(Note.meeting_id == meeting_id).first()
            if note:
                note.content = req.notes
                note.updated_at = datetime.now()
            else:
                db.add(Note(
                    meeting_id=meeting_id,
                    content=req.notes,
                ))

        db.commit()

        return {
            "id": meeting.id,
            "title": meeting.title,
            "notes": req.notes,
        }


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str):
    """Fetch a single meeting with its full transcript + analysis."""
    with SessionLocal() as db:
        m = db.get(Meeting, meeting_id)
        if not m:
            raise HTTPException(status_code=404, detail="Meeting not found")
        # Fetch notes
        note = db.query(Note).filter(Note.meeting_id == meeting_id).first()
        return {
            "id": m.id,
            "title": m.title,
            "status": m.status,
            "started_at": m.started_at.isoformat() if m.started_at else None,
            "ended_at": m.ended_at.isoformat() if m.ended_at else None,
            "duration_seconds": m.duration_seconds,
            "analysis": _safe_json(m.analysis),
            "notes": note.content if note else "",
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
    with session._lock:
        if session.active:
            return {"error": "Meeting already active", "meeting_id": session.meeting_id}

        session.meeting_id = str(uuid.uuid4())[:8].upper()
        session.start_time = time.time()
        session.segments = []
        session._loop = asyncio.get_running_loop()
        session._summary_language = req.summary_language
        session._groq_api_key = req.groq_api_key or None

    # Persist the meeting row
    with SessionLocal() as db:
        db.add(Meeting(
            id=session.meeting_id,
            title=req.title,
            status="recording",
            started_at=datetime.now(),
        ))
        db.commit()

    q = AudioStreamQueue(sample_rate=16000)

    # VAD disabled at capture level — Whisper's built-in VAD is more accurate
    # and removing capture VAD prevents dropping audio chunks that cause word skipping.

    # Use WASAPI loopback for system audio (works even when volume is down)
    wasapi = None
    if req.enable_loopback and req.use_wasapi and HAS_WASAPI:
        try:
            wasapi = WASAPICapture(
                stream_queue=q,
                sample_rate=16000,
            )
        except Exception as e:
            logger.warning(f"WASAPI init failed, falling back to sounddevice: {e}")

    session.capture = AudioCapture(
        stream_queue=q,
        mic_device=req.mic_device,
        loopback_device=req.loopback_device,
    )

    def on_segment(seg: TranscriptSegment):
        with session._lock:
            session.segments.append(seg)
            seg_count = len(session.segments)
            meeting_id = session.meeting_id
        # Persist each segment as it arrives (separate session per write
        # so the Whisper thread never shares a session with the API).
        try:
            with SessionLocal() as db:
                db.add(TranscriptSegmentRow(
                    meeting_id=meeting_id,
                    sequence=seg_count,
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
        buffer_duration_s=2.0,
        overlap_duration_s=1.5,
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
    with session._lock:
        session.active = True

    await push_status("recording", session.meeting_id)
    logger.info(f"Meeting {session.meeting_id} started")
    return {"meeting_id": session.meeting_id, "status": "recording"}


@router.post("/stop")
async def stop_meeting():
    with session._lock:
        if not session.active:
            return {"error": "No active meeting"}
        mid = session.meeting_id
        segs = session.segments[:]
        duration = round(time.time() - session.start_time, 1)
        summary_lang = session._summary_language
        groq_key = session._groq_api_key or Config.GROQ_API_KEY
        # Capture refs under lock so they can't be nulled by a concurrent reset
        capture = session.capture
        transcriber = session.transcriber
        wasapi = getattr(session, '_wasapi', None)

    try:
        if capture:
            capture.stop()
        if transcriber:
            transcriber.stop()
        if wasapi:
            wasapi.stop()
            with session._lock:
                session._wasapi = None
    except Exception as e:
        logger.warning(f"Error stopping capture/transcriber: {e}")

    # Build raw transcript text (with timestamps + speakers for better analysis)
    raw_transcript = build_raw_transcript(segs)

    # Analyze with Groq LLM (if API key is available)
    analysis = {}
    if len(segs) > 0 and groq_key:
        try:
            llm = GroqEngine(api_key=groq_key)
            analyzer = MeetingAnalyzer(llm)
            analysis = analyzer.analyze(raw_transcript, output_language=summary_lang)
            logger.info(f"Analysis complete: {list(analysis.keys())}")
        except Exception as e:
            logger.warning(f"Analysis failed: {e}")
            analysis = {"error": str(e)}
    elif len(segs) == 0:
        analysis = {"error": "No speech detected in meeting"}
    else:
        analysis = {"info": "GROQ_API_KEY not set — skipping analysis. Set it in .env to enable."}

    # Generate meeting title from analysis summary (only if user didn't provide one)
    meeting_title = _generate_title(analysis, session.start_time)

    # Save transcript with analysis (Markdown export artifact)
    path = ""
    try:
        path = _save_transcript(mid, segs, duration, analysis, title=meeting_title)
    except Exception as e:
        logger.warning(f"Failed to save transcript file: {e}")

    # Persist analysis + title + finalize the meeting row
    analysis_json = json.dumps(analysis, ensure_ascii=False) if analysis else None
    try:
        with SessionLocal() as db:
            meeting = db.get(Meeting, mid)
            if meeting:
                meeting.status = "completed"
                meeting.ended_at = datetime.now()
                meeting.duration_seconds = duration
                meeting.analysis = analysis_json
                # Only auto-generate title if user didn't provide one at start
                if not meeting.title:
                    meeting.title = meeting_title
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

import re

def _safe_json(raw: str | None):
    """Parse JSON safely, returning None on corruption."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None

def _generate_title(analysis: dict, start_time: float) -> str:
    """Generate meeting title as YYYY-MM-DD_HH-MM_<short_summary>."""
    now = datetime.fromtimestamp(start_time)
    date_str = now.strftime("%Y-%m-%d_%H-%M")
    summary = ""
    if analysis and isinstance(analysis, dict):
        raw = analysis.get("summary", "")
        if isinstance(raw, list):
            raw = raw[0] if raw else ""
        if isinstance(raw, str) and raw.strip():
            summary = raw.strip()
    if not summary:
        summary = "meeting"
    # Clean: take first ~60 chars, replace non-alphanum with underscore, collapse
    summary = summary[:60]
    summary = re.sub(r"[^a-zA-Z0-9]+", "_", summary).strip("_").lower()
    return f"{date_str}_{summary}"


def _save_transcript(mid: str, segments: list[TranscriptSegment], duration: float, analysis: dict = None, title: str = None) -> str:
    Path("meetings").mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    display_title = title or mid
    path = f"meetings/{ts}_{mid}_{display_title}.md"

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# {display_title}\n")
        f.write(f"**ID:** {mid}\n")
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