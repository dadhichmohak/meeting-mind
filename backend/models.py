"""
SQLAlchemy ORM models.

Meeting  → one recording session
TranscriptSegment → one transcribed utterance within a meeting
Note     → free-form user notes attached to a meeting
"""
from datetime import datetime

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    DateTime,
    Text,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _localnow() -> datetime:
    return datetime.now()


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String(36), primary_key=True)  # 8-char uuid (e.g. "A1B2C3D4")
    title = Column(String(255), nullable=True)
    status = Column(String(20), default="recording")  # recording | completed
    started_at = Column(DateTime, default=_localnow)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, default=0.0)
    analysis = Column(Text, nullable=True)  # JSON string from Groq analysis
    created_at = Column(DateTime, default=_localnow)

    segments = relationship(
        "TranscriptSegment",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.sequence",
    )
    notes = relationship(
        "Note", back_populates="meeting", cascade="all, delete-orphan"
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    sequence = Column(Integer, default=0)
    text = Column(Text, nullable=False)
    speaker = Column(String(100), nullable=True)
    start_sec = Column(Float, default=0.0)
    end_sec = Column(Float, default=0.0)

    meeting = relationship("Meeting", back_populates="segments")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    content = Column(Text, default="")
    created_at = Column(DateTime, default=_localnow)
    updated_at = Column(DateTime, default=_localnow, onupdate=_localnow)

    meeting = relationship("Meeting", back_populates="notes")
