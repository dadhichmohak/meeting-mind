"""
Meeting analysis using Groq LLM.
Extracts: summary, decisions, action items, risks, questions, follow-ups
"""
from loguru import logger
from backend.llm.groq_engine import GroqEngine
from backend.llm.prompts import ANALYZE_PROMPT


class MeetingAnalyzer:
    def __init__(self, llm: GroqEngine = None):
        self.llm = llm or GroqEngine()

    def analyze(self, transcript_text: str) -> dict:
        """
        Analyze full transcript and extract all sections.
        Returns dict with keys: summary, decisions, action_items, risks, questions, follow_ups
        """
        if not self.llm.health_check():
            logger.error("Groq API not available")
            return {"error": "LLM unavailable. Check GROQ_API_KEY environment variable."}

        logger.info("Analyzing meeting with Groq...")
        response = self.llm.generate(
            prompt=ANALYZE_PROMPT.format(transcript=transcript_text),
            system="You are a professional meeting analyst. Extract information accurately and concisely.",
        )

        if not response:
            return {"error": "LLM analysis failed"}

        # Parse response into sections
        sections = self._parse_response(response)
        logger.info(f"Analysis complete: {len([s for s in sections.values() if s])} sections")
        return sections

    def _parse_response(self, text: str) -> dict:
        """Parse LLM response into structured dict."""
        result = {
            "summary": "",
            "decisions": [],
            "action_items": [],
            "risks": [],
            "questions": [],
            "follow_ups": [],
        }

        current_section = None
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue

            # Section headers
            if "EXECUTIVE SUMMARY" in line.upper():
                current_section = "summary"
                continue
            elif "KEY DECISIONS" in line.upper():
                current_section = "decisions"
                continue
            elif "ACTION ITEMS" in line.upper():
                current_section = "action_items"
                continue
            elif "RISKS" in line.upper() or "CONCERNS" in line.upper():
                current_section = "risks"
                continue
            elif "OPEN QUESTIONS" in line.upper():
                current_section = "questions"
                continue
            elif "FOLLOW" in line.upper():
                current_section = "follow_ups"
                continue
            elif current_section and line and not line.startswith("#"):
                # Add content to current section
                if current_section == "summary":
                    result["summary"] += " " + line if result["summary"] else line
                else:
                    # Remove bullet/dash/number prefix
                    content = line.lstrip("-•*0123456789. ").strip()
                    if content and len(content) > 3:  # avoid noise
                        result[current_section].append(content)

        return result