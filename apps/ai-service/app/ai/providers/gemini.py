import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings


class GeminiProvider:
    def __init__(self):
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY not configured")
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            generation_config=genai.GenerationConfig(
                temperature=settings.gemini_temperature,
                max_output_tokens=settings.gemini_max_tokens,
            ),
        )

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
    )
    async def generate(self, prompt: str) -> str:
        response = await self.model.generate_content_async(prompt)
        if not response.text:
            raise ValueError("Empty response from Gemini")
        return response.text.strip()


gemini_provider = GeminiProvider()