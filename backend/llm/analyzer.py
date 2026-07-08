"""
Meeting analysis using Groq LLM.
Extracts: summary, decisions, action items, risks, questions, follow-ups
via structured (JSON) output for reliable parsing.
"""
from loguru import logger
from backend.llm.groq_engine import GroqEngine


class MeetingAnalyzer:
    _SECTION_KEYS = ("summary", "decisions", "action_items", "risks", "questions", "follow_ups")

    def __init__(self, llm: GroqEngine = None):
        self.llm = llm or GroqEngine()

    def analyze(self, transcript_text: str, output_language: str = "en") -> dict:
        if not self.llm.health_check():
            logger.error("Groq API not available")
            return {"error": "LLM unavailable. Check GROQ_API_KEY environment variable."}

        lang_names = {
            "en": "English", "es": "Spanish", "fr": "French", "de": "German",
            "it": "Italian", "pt": "Portuguese", "hi": "Hindi", "hi-en": "Hinglish (Hindi-English mix)",
            "ja": "Japanese", "ko": "Korean", "zh": "Chinese", "ar": "Arabic", "ru": "Russian",
        }
        lang_name = lang_names.get(output_language, "English")

        logger.info(f"Analyzing meeting with Groq (output: {lang_name})...")

        system = (
            f"You are a professional meeting analyst. "
            f"Respond in {lang_name}. "
            "You MUST respond with a single valid JSON object and nothing else. "
            "The JSON must have exactly these keys:\n"
            '- "summary" (string): 2-3 sentence executive summary of main topics and outcomes\n'
            '- "decisions" (array of strings): Key decisions made, be specific\n'
            '- "action_items" (array of strings): Tasks with owner and deadline if mentioned. '
            'Format each as "[TASK] — Owner: [NAME or TBD], Deadline: [DATE or TBD]"\n'
            '- "risks" (array of strings): Potential issues, blockers, or concerns mentioned\n'
            '- "questions" (array of strings): Open questions that remain unanswered\n'
            '- "follow_ups" (array of strings): Next steps and required follow-ups\n\n'
            "Rules:\n"
            "- Extract ONLY what was explicitly discussed in the transcript\n"
            "- Be concise and factual\n"
            "- For empty sections use an empty array []\n"
            "- Do NOT wrap values in markdown code blocks\n"
            "- Do NOT add any text outside the JSON object"
        )

        user = (
            "Analyze the following meeting transcript and return the JSON object.\n\n"
            f"TRANSCRIPT:\n{transcript_text}"
        )

        data = self.llm.generate_json(user, system=system)
        if data is None:
            return {"error": "LLM analysis failed"}

        result = self._normalize(data)
        logger.info(f"Analysis complete: {len([v for v in result.values() if v])} sections")
        return result

    def _normalize(self, data: dict) -> dict:
        result = {key: [] for key in self._SECTION_KEYS}
        result["summary"] = ""

        if not isinstance(data, dict):
            logger.warning(f"LLM returned non-dict: {type(data)}")
            return result

        # Handle summary - can be string or list
        raw_summary = data.get("summary", "")
        if isinstance(raw_summary, list):
            raw_summary = raw_summary[0] if raw_summary else ""
        result["summary"] = raw_summary.strip() if isinstance(raw_summary, str) else str(raw_summary).strip()

        # Handle array sections
        for key in self._SECTION_KEYS:
            if key == "summary":
                continue
            value = data.get(key, [])

            # If it's a string, try to parse as newline-separated list
            if isinstance(value, str):
                value = [line.strip("-•* →").strip() for line in value.splitlines() if line.strip()]
            # If it's a single value (not list), wrap in list
            elif not isinstance(value, list):
                value = [value]

            # Clean up each item
            cleaned = []
            for v in value:
                s = str(v).strip()
                # Remove leading bullet points or dashes that might have been missed
                s = s.lstrip("-•* →→").strip()
                if s:
                    cleaned.append(s)
            result[key] = cleaned

        # Log what we found
        for key, val in result.items():
            if val:
                logger.debug(f"  {key}: {len(val)} items")

        return result
