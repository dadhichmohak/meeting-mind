"""Helpers for formatting transcript text."""

from datetime import timedelta


def format_timestamp(seconds) -> str:
    """Format seconds as mm:ss."""
    try:
        seconds = int(float(seconds or 0))
    except (TypeError, ValueError):
        seconds = 0
    return str(timedelta(seconds=seconds))[2:].zfill(5)  # mm:ss


def build_raw_transcript(segments) -> str:
    """Build a readable transcript with [mm:ss] and speaker prefixes.

    Accepts any object exposing .start, .speaker, .text (TranscriptSegment,
    TranscriptSegmentRow, dict-like). Used both for LLM analysis context and
    for human-readable exports.
    """
    lines = []
    for seg in segments:
        start = getattr(seg, "start", None) or getattr(seg, "start_sec", 0) or 0
        speaker = getattr(seg, "speaker", None)
        text = (getattr(seg, "text", "") or "").strip()
        if not text:
            continue
        prefix = f"[{format_timestamp(start)}] "
        if speaker:
            prefix += f"{speaker}: "
        lines.append(prefix + text)
    return "\n".join(lines)
