"""Initial schema: meetings, transcript_segments, notes.

Matches backend/models.py.
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "meetings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=True, server_default="recording"),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True, server_default=sa.text("0.0")),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("meeting_id", sa.String(length=36), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("speaker", sa.String(length=100), nullable=True),
        sa.Column("start_sec", sa.Float(), nullable=True, server_default=sa.text("0.0")),
        sa.Column("end_sec", sa.Float(), nullable=True, server_default=sa.text("0.0")),
    )
    op.create_index("ix_transcript_segments_meeting_id", "transcript_segments", ["meeting_id"])
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("meeting_id", sa.String(length=36), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=True),
        sa.Column("content", sa.Text(), nullable=True, server_default=sa.text("''")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_notes_meeting_id", "notes", ["meeting_id"])


def downgrade():
    op.drop_index("ix_notes_meeting_id", table_name="notes")
    op.drop_table("notes")
    op.drop_index("ix_transcript_segments_meeting_id", table_name="transcript_segments")
    op.drop_table("transcript_segments")
    op.drop_table("meetings")
