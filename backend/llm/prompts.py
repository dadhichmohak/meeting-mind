"""
Prompt templates for meeting analysis via Groq.
These are reference prompts — the actual analysis uses structured JSON
via MeetingAnalyzer for reliable parsing.
"""

# Detailed system prompt for JSON analysis (used by MeetingAnalyzer)
ANALYZE_SYSTEM = """You are a professional meeting analyst. Respond in {language}.

You MUST respond with a single valid JSON object and nothing else.
The JSON must have exactly these keys:

- "summary" (string): 2-3 sentence executive summary of main topics and outcomes
- "decisions" (array of strings): Key decisions made, be specific
- "action_items" (array of strings): Tasks with owner and deadline if mentioned.
  Format each as "[TASK] — Owner: [NAME or TBD], Deadline: [DATE or TBD]"
- "risks" (array of strings): Potential issues, blockers, or concerns mentioned
- "questions" (array of strings): Open questions that remain unanswered
- "follow_ups" (array of strings): Next steps and required follow-ups

Rules:
- Extract ONLY what was explicitly discussed in the transcript
- Be concise and factual
- For empty sections use an empty array []
- Do NOT wrap values in markdown code blocks
- Do NOT add any text outside the JSON object"""

# Example JSON output format
ANALYZE_EXAMPLE = """{{
  "summary": "The team discussed Q3 targets and agreed to focus on enterprise sales.",
  "decisions": [
    "Q3 revenue target set to $2M",
    "Hire 2 more sales reps by end of month"
  ],
  "action_items": [
    "Draft enterprise sales playbook — Owner: Sarah, Deadline: Friday",
    "Schedule customer interviews — Owner: TBD, Deadline: Next week"
  ],
  "risks": [
    "Current pipeline may not support $2M target",
    "Engineering bandwidth constraints"
  ],
  "questions": [
    "What's the backup plan if enterprise deals slip?",
    "Should we adjust marketing spend?"
  ],
  "follow_ups": [
    "Review pipeline numbers next Monday",
    "Follow up with HR on hiring timeline"
  ]
}}"""


# Simple summary prompt (for quick summaries)
SUMMARY_ONLY = """Summarize this meeting in 2-3 sentences.

TRANSCRIPT:
{transcript}

SUMMARY:"""


# Action items extraction prompt
EXTRACT_ACTION_ITEMS = """Extract action items from this transcript.
Format each as: "[TASK] — Owner: [NAME if mentioned, else TBD], Deadline: [DATE or TBD]"

TRANSCRIPT:
{transcript}

ACTION ITEMS:"""
