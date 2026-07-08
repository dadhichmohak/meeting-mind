"""Helpers for formatting transcript text."""


def format_timestamp(seconds) -> str:
    """Format seconds as mm:ss (or h:mm:ss if >= 1 hour)."""
    try:
        seconds = int(float(seconds or 0))
    except (TypeError, ValueError):
        seconds = 0
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


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
