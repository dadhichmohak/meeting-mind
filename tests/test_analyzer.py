"""Tests for the meeting analyzer's structured-output normalization."""
from backend.llm.analyzer import MeetingAnalyzer


def test_normalize_full():
    a = MeetingAnalyzer()
    data = {
        "summary": "Short sync.",
        "decisions": ["Decided X"],
        "action_items": ["Do Y"],
        "risks": [],
        "questions": ["Why?"],
        "follow_ups": ["Schedule next"],
    }
    out = a._normalize(data)
    assert out["summary"] == "Short sync."
    assert out["decisions"] == ["Decided X"]
    assert out["action_items"] == ["Do Y"]
    assert out["risks"] == []
    assert out["questions"] == ["Why?"]
    assert out["follow_ups"] == ["Schedule next"]


def test_normalize_missing_keys():
    a = MeetingAnalyzer()
    out = a._normalize({})
    assert out["summary"] == ""
    assert all(isinstance(v, list) for k, v in out.items() if k != "summary")


def test_normalize_string_list():
    a = MeetingAnalyzer()
    out = a._normalize({"summary": "s", "action_items": "- one\n- two"})
    assert out["action_items"] == ["one", "two"]


def test_normalize_non_list_value():
    a = MeetingAnalyzer()
    out = a._normalize({"summary": "s", "decisions": "Just one decision"})
    assert out["decisions"] == ["Just one decision"]
