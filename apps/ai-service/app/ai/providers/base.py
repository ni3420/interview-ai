from typing import Protocol


class LLMProvider(Protocol):
    """Minimal provider contract used by the interview endpoints."""

    async def generate(self, prompt: str) -> str: ...
