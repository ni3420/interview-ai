import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings


class GeminiProvider:
    def __init__(self):
        # The model is created lazily so the service (and its tests) can be
        # imported without GEMINI_API_KEY configured.
        self._model = None

    def _get_model(self):
        if self._model is None:
            if not settings.gemini_api_key:
                raise ValueError("GEMINI_API_KEY not configured")
            genai.configure(api_key=settings.gemini_api_key)
            self._model = genai.GenerativeModel(
                model_name=settings.gemini_model,
                generation_config=genai.GenerationConfig(
                    temperature=settings.gemini_temperature,
                    max_output_tokens=settings.gemini_max_tokens,
                ),
            )
        return self._model

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
    )
    async def generate(self, prompt: str) -> str:
        response = await self._get_model().generate_content_async(prompt)
        if not response.text:
            raise ValueError("Empty response from Gemini")
        return response.text.strip()


gemini_provider = GeminiProvider()