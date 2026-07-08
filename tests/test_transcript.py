"""Tests for transcript formatting helpers."""
from backend.utils.transcript import build_raw_transcript, format_timestamp


class _Seg:
    def __init__(self, start, text, speaker=None):
        self.start = start
        self.text = text
        self.speaker = speaker


def test_format_timestamp():
    assert format_timestamp(0) == "00:00"
    assert format_timestamp(65) == "01:05"
    assert format_timestamp(600) == "10:00"


def test_build_raw_transcript_with_speaker():
    segs = [_Seg(0, "Hello", "Alice"), _Seg(65, "World", None)]
    out = build_raw_transcript(segs)
    assert "[00:00] Alice: Hello" in out
    assert "[01:05] World" in out


def test_build_raw_transcript_skips_empty():
    segs = [_Seg(0, "  ", "Bob"), _Seg(5, "Real", "Bob")]
    out = build_raw_transcript(segs)
    assert "Real" in out
    assert out.count("\n") == 0
