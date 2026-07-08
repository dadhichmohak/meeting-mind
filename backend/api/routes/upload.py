"""
POST /upload  — Upload audio file, transcribe + summarize
"""
import json
import uuid
import tempfile
import os
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from loguru import logger
from pydantic import BaseModel

from backend.config import Config
from backend.database import SessionLocal
from backend.models import Meeting, TranscriptSegment as TranscriptSegmentRow
from backend.whisper.transcriber import Transcriber, TranscriptSegment
from backend.llm.groq_engine import GroqEngine
from backend.llm.analyzer import MeetingAnalyzer
from backend.utils.transcript import build_raw_transcript

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mp4", ".aac", ".wma"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB
MEETINGS_DIR = Path("meetings").resolve()


def _safe_title(raw: str) -> str:
    """Strip path separators and dangerous chars to prevent path traversal."""
    raw = raw.replace("\\", "").replace("/", "").replace("\x00", "")
    return re.sub(r"[^a-zA-Z0-9\s_\-.]", "", raw).strip()[:80] or "untitled"


def _generate_title(analysis: dict, start_time: datetime = None) -> str:
    """Generate meeting title as YYYY-MM-DD_HH-MM_<short_summary>."""
    now = start_time or datetime.now()
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
    summary = summary[:60]
    summary = re.sub(r"[^a-zA-Z0-9]+", "_", summary).strip("_").lower()
    return f"{date_str}_{summary}"


class UploadResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    meeting_id: str
    filename: str
    duration_seconds: float
    segment_count: int
    transcript: list[dict]
    analysis: dict | None = None


def _transcribe_file(audio_path: str, model_size: str = Config.WHISPER_MODEL, language: str = "en") -> list[TranscriptSegment]:
    """Transcribe an audio file using faster-whisper."""
    from faster_whisper import WhisperModel
    import numpy as np

    logger.info(f"Loading Whisper '{model_size}' for file transcription...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    logger.info(f"Transcribing: {audio_path}")
    segments_gen, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 800},
    )

    results = []
    for seg in segments_gen:
        text = seg.text.strip()
        if text:
            results.append(TranscriptSegment(
                text=text,
                start=round(seg.start, 2),
                end=round(seg.end, 2),
            ))

    logger.info(f"Transcription complete: {len(results)} segments, {info.duration:.1f}s audio")
    return results, info.duration


def _save_upload_transcript(mid: str, filename: str, segments: list[TranscriptSegment], duration: float, analysis: dict = None, title: str = None) -> str:
    """Save uploaded transcript as markdown."""
    MEETINGS_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    display_title = _safe_title(title or filename or mid)
    path = MEETINGS_DIR / f"upload_{ts}_{mid}_{display_title}.md"

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# {display_title}\n")
        f.write(f"**ID:** {mid}\n")
        f.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Source:** Uploaded file ({filename})\n")
        f.write(f"**Duration:** {duration:.1f}s\n\n---\n\n")

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

        f.write("## Transcript\n\n")
        for seg in segments:
            m, s = divmod(int(seg.start), 60)
            f.write(f"`{m:02d}:{s:02d}` {seg.text}\n\n")

    return path


@router.post("", response_model=UploadResponse)
async def upload_audio(
    file: UploadFile = File(...),
    model_size: str = Config.WHISPER_MODEL,
    language: str = "en",
    summary_language: str = "en",
    groq_api_key: str | None = None,
):
    """Upload an audio file to transcribe and analyze."""
    # Validate file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Read file content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 500MB)")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Save to temp file
    mid = str(uuid.uuid4())[:8].upper()
    suffix = ext if ext else ".wav"
    tmp_path = os.path.join(tempfile.gettempdir(), f"upload_{mid}{suffix}")

    try:
        with open(tmp_path, "wb") as f:
            f.write(content)

        # Transcribe
        segments, duration = _transcribe_file(tmp_path, model_size=model_size, language=language)

        # Build raw transcript (with timestamps + speakers for better analysis)
        raw_transcript = build_raw_transcript(segments)

        # Analyze with Groq if we have content
        api_key = groq_api_key or Config.GROQ_API_KEY
        analysis = {}
        if len(segments) > 0 and api_key:
            try:
                llm = GroqEngine(api_key=api_key)
                analyzer = MeetingAnalyzer(llm)
                analysis = analyzer.analyze(raw_transcript, output_language=summary_language)
                logger.info(f"Upload analysis complete: {list(analysis.keys())}")
            except Exception as e:
                logger.warning(f"Upload analysis failed: {e}")
                analysis = {"error": str(e)}
        elif len(segments) == 0:
            analysis = {"error": "No speech detected in audio"}
        else:
            analysis = {"info": "GROQ_API_KEY not set — skipping analysis."}

        # Use filename as meeting title (strip extension, clean up)
        raw_name = Path(file.filename or "unknown").stem
        meeting_title = re.sub(r"[^a-zA-Z0-9\s_-]", "", raw_name).strip() or raw_name

        # Save transcript file
        _save_upload_transcript(mid, file.filename or "unknown", segments, duration, analysis, title=meeting_title)

        # Persist to database
        with SessionLocal() as db:
            db.add(Meeting(
                id=mid,
                title=meeting_title,
                status="completed",
                started_at=datetime.now(),
                ended_at=datetime.now(),
                duration_seconds=duration,
                analysis=json.dumps(analysis, ensure_ascii=False) if analysis else None,
            ))
            for i, seg in enumerate(segments):
                db.add(TranscriptSegmentRow(
                    meeting_id=mid,
                    sequence=i + 1,
                    text=seg.text,
                    speaker=seg.speaker,
                    start_sec=seg.start,
                    end_sec=seg.end,
                ))
            db.commit()

        return UploadResponse(
            meeting_id=mid,
            filename=file.filename or "unknown",
            duration_seconds=round(duration, 1),
            segment_count=len(segments),
            transcript=[s.to_dict() for s in segments],
            analysis=analysis,
        )

    finally:
        # Cleanup temp file
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
