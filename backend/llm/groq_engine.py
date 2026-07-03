"""
Groq API LLM engine.
Uses groq-python client for fast inference.
Reads GROQ_API_KEY and GROQ_MODEL from .env file.
"""
from loguru import logger
from backend.config import Config


class GroqEngine:
    def __init__(self, model: str = None):
        """
        Initialize Groq engine with model from .env or override.
        
        If model is None, uses GROQ_MODEL from .env.
        Otherwise uses the provided model.
        
        Check available models at: https://console.groq.com/docs/models
        """
        self.model = model or Config.GROQ_MODEL
        self.api_key = Config.GROQ_API_KEY
        
        if not self.api_key:
            logger.warning("GROQ_API_KEY not set. LLM features will be disabled.")
        
        if not self.model:
            logger.warning("GROQ_MODEL not set. Using default.")
            self.model = "llama-3.1-70b-versatile"
        
        self._client = None

    def _get_client(self):
        """Lazy load Groq client."""
        if self._client is None and self.api_key:
            try:
                from groq import Groq
                self._client = Groq(api_key=self.api_key)
                logger.debug(f"Groq client initialized (model: {self.model})")
            except Exception as e:
                logger.error(f"Failed to init Groq: {e}")
        return self._client

    def generate(self, prompt: str, system: str = "", temperature: float = 0.3) -> str:
        """Send request to Groq API."""
        client = self._get_client()
        if not client:
            logger.error("Groq client not initialized — check GROQ_API_KEY in .env")
            return ""

        try:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            logger.debug(f"Sending request to Groq ({self.model})...")
            response = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=2048,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            return ""

    def health_check(self) -> bool:
        """Check if API key is valid and Groq is accessible."""
        if not self.api_key:
            logger.warning("No GROQ_API_KEY set in .env")
            return False

        client = self._get_client()
        if not client:
            return False

        try:
            logger.debug(f"Health check: testing model '{self.model}'...")
            response = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "ok"}],
                max_tokens=5,
            )
            logger.info(f"✓ Groq API health check passed (model: {self.model})")
            return True
        except Exception as e:
            logger.error(f"Groq health check failed: {e}")
            logger.info(f"Make sure '{self.model}' is available at https://console.groq.com/docs/models")
            return False