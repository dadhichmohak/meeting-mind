"""
Prompt templates for meeting analysis via Groq.
"""

ANALYZE_PROMPT = """You are a professional meeting analyst. Analyze this transcript and extract key information.

TRANSCRIPT:
{transcript}

Provide output in this EXACT format with clear sections:

## EXECUTIVE SUMMARY
2-3 sentences summarizing the main topics and outcomes.

## KEY DECISIONS
List decisions made (one per bullet, be specific).

## ACTION ITEMS
Format: "- [SPECIFIC TASK] → Owner: [NAME or TBD] | Deadline: [DATE or TBD]"

## OPEN QUESTIONS
Questions that remain unanswered (one per bullet).

## RISKS & CONCERNS
Potential issues or blockers mentioned (one per bullet).

## FOLLOW-UPS
Next steps and required follow-ups (one per bullet).

Be concise, factual, and extract only what was explicitly discussed."""


SUMMARY_ONLY = """Summarize this meeting in 2-3 sentences.

TRANSCRIPT:
{transcript}

SUMMARY:"""


EXTRACT_ACTION_ITEMS = """Extract action items from this transcript.
Format: "- [SPECIFIC TASK] → Owner: [NAME if mentioned, else TBD] | Deadline: [DATE or TBD]"

TRANSCRIPT:
{transcript}

ACTION ITEMS:"""