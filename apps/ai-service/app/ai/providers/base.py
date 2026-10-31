from typing import Protocol


class LLMProvider(Protocol):
    """Minimal provider contract used by the interview endpoints.

    Report evaluation passes deterministic generation options; providers that
    do not support one of them may ignore it.
    """

    async def generate(
        self,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        seed: int | None = None,
    ) -> str: ...
