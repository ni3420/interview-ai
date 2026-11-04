"""Adapter for services that expose an OpenAI-compatible chat API.

TokenHarbor and several other gateways implement ``POST /chat/completions``
with a bearer token. Only that contract is used here, so no vendor SDK is
required and the tenant can be switched by configuration alone.
"""

from __future__ import annotations

from time import perf_counter

import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.ai.providers.base import (
    BaseChatProvider,
    ChatRequest,
    ChatResponse,
    ProviderCapabilities,
    ProviderConfigurationError,
    ProviderResponseError,
    TokenUsage,
    is_switchable_error,
)
from app.ai.providers.registry import registry
from app.core.config import settings
from app.core.metrics import log_event, record_usage


class OpenAICompatibleProvider(BaseChatProvider):
    """Generic OpenAI-compatible chat completion adapter.

    Subclasses supply connection settings and a provider name. Requests and
    responses are normalized here so routing and business logic stay unaware of
    the vendor. ``seed`` is not sent: support varies by upstream model.
    """

    name = "openai-compatible"
    capabilities = ProviderCapabilities(
        temperature=True,
        max_tokens=True,
        seed=False,
        json_mode=False,
        streaming=False,
    )

    @property
    def base_url(self) -> str:
        raise NotImplementedError

    @property
    def api_key(self) -> str:
        raise NotImplementedError

    @property
    def model(self) -> str:
        raise NotImplementedError

    @property
    def default_temperature(self) -> float:
        return 0.7

    @property
    def default_max_tokens(self) -> int:
        return 2048

    @property
    def timeout_seconds(self) -> float:
        return 120.0

    @property
    def endpoint(self) -> str:
        # The base URL usually ends in /v1. Joining the full URL avoids httpx
        # dropping that path segment when a leading-slash path is posted.
        return f"{self.base_url.strip().rstrip('/')}/chat/completions"

    async def is_configured(self) -> bool:
        return bool(self.api_key.strip() and self.base_url.strip() and self.model.strip())

    @retry(
        retry=retry_if_exception(is_switchable_error),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    async def complete(self, request: ChatRequest) -> ChatResponse:
        if not await self.is_configured():
            raise ProviderConfigurationError(
                f"{self.name} is not configured: set its API key, base URL and model"
            )

        started = perf_counter()
        payload: dict[str, object] = {
            "model": self.model,
            "messages": [{"role": "user", "content": request.prompt}],
            "temperature": (
                self.default_temperature if request.temperature is None else request.temperature
            ),
            "max_tokens": (
                self.default_max_tokens if request.max_tokens is None else request.max_tokens
            ),
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            self._raise_for_status(response)
            try:
                data = response.json()
            except ValueError as error:
                log_event(
                    "ai provider response",
                    provider=self.name,
                    model=self.model,
                    httpStatus=response.status_code,
                    structure="non-json",
                )
                raise ProviderResponseError(
                    f"returned HTTP {response.status_code} with a non-JSON body",
                    provider=self.name,
                ) from error

        diagnostics = self._response_diagnostics(data, http_status=response.status_code)
        log_event("ai provider response", **diagnostics)

        usage = self._usage(data)
        prompt_tokens = usage.get("prompt_tokens")
        completion_tokens = usage.get("completion_tokens")
        # Tokens are billed even when the answer is unusable, so record usage
        # before extraction can fail.
        record_usage(
            provider=self.name,
            model=self.model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        text = self._extract_text(data)
        return ChatResponse(
            text=text,
            provider=self.name,
            model=self.model,
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            ),
            latency_ms=round((perf_counter() - started) * 1000, 1),
        )

    def _raise_for_status(self, response: httpx.Response) -> None:
        """Raise an HTTP error that keeps the provider's own error code.

        A bare status code is not actionable: gateways report account problems
        such as ``email_verification_required`` in the JSON body. Include the
        sanitized code and message so logs explain the failure; the exception
        still carries the response, so retry/switch classification is unchanged.
        """
        if response.is_success:
            return

        detail = f"{self.name} returned HTTP {response.status_code}"
        try:
            payload = response.json()
        except ValueError:
            payload = None
        error = payload.get("error") if isinstance(payload, dict) else None
        code = ""
        if isinstance(error, dict):
            code = str(error.get("code") or error.get("type") or "").strip()
            message = str(error.get("message") or "").strip()
            if code:
                detail += f" ({code})"
            if message:
                detail += f": {message[:300]}"

        log_event(
            "ai provider error",
            provider=self.name,
            model=self.model,
            httpStatus=response.status_code,
            providerCode=code or None,
        )
        raise httpx.HTTPStatusError(detail, request=response.request, response=response)

    def _response_diagnostics(self, data: object, *, http_status: int) -> dict[str, object]:
        """Describe the response shape without logging prompt or answer text."""
        choices = data.get("choices") if isinstance(data, dict) else None
        first_choice = (
            choices[0]
            if isinstance(choices, list) and choices and isinstance(choices[0], dict)
            else {}
        )
        message = first_choice.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        reasoning = message.get("reasoning_content") if isinstance(message, dict) else None
        usage = self._usage(data)
        legacy_text = first_choice.get("text")
        return {
            "provider": self.name,
            "model": self.model,
            "httpStatus": http_status,
            "topLevelKeys": sorted(data.keys()) if isinstance(data, dict) else None,
            "choiceCount": len(choices) if isinstance(choices, list) else 0,
            "finishReason": first_choice.get("finish_reason"),
            "messageKeys": sorted(message.keys()) if isinstance(message, dict) else None,
            "contentType": type(content).__name__,
            "contentChars": len(content.strip()) if isinstance(content, str) else None,
            "contentParts": len(content) if isinstance(content, list) else None,
            "reasoningChars": (len(reasoning.strip()) if isinstance(reasoning, str) else None),
            "hasLegacyText": isinstance(legacy_text, str) and bool(legacy_text.strip()),
            "promptTokens": usage.get("prompt_tokens"),
            "completionTokens": usage.get("completion_tokens"),
        }

    @staticmethod
    def _usage(data: object) -> dict:
        usage = data.get("usage") if isinstance(data, dict) else None
        return usage if isinstance(usage, dict) else {}

    @classmethod
    def _content_text(cls, content: object) -> str | None:
        """Normalize the accepted OpenAI-compatible content formats.

        ``content`` is a string in classic chat completions and a list of parts
        in newer multimodal responses. Only text parts are used; reasoning
        parts are never promoted to the final answer.
        """
        if isinstance(content, str):
            text = content.strip()
            return text or None

        if isinstance(content, list):
            parts: list[str] = []
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") not in (None, "text", "output_text"):
                    continue
                text = part.get("text")
                if isinstance(text, str):
                    parts.append(text)
            combined = "".join(parts).strip()
            return combined or None

        return None

    @staticmethod
    def _empty_detail(choice: dict, message: object) -> str:
        content: object = None
        reasoning_chars = 0
        if isinstance(message, dict):
            content = message.get("content")
            reasoning = message.get("reasoning_content")
            if isinstance(reasoning, str):
                reasoning_chars = len(reasoning.strip())

        content_type = "null" if content is None else type(content).__name__
        detail = f"finish_reason={choice.get('finish_reason')!r}, content={content_type}"
        if reasoning_chars:
            detail += f", reasoning_content={reasoning_chars} chars"
        if choice.get("finish_reason") == "length":
            detail += "; the token budget may have been spent on reasoning_content"
        return detail

    def _extract_text(self, data: object) -> str:
        if not isinstance(data, dict):
            raise ProviderResponseError(
                f"expected a JSON object, got {type(data).__name__}",
                provider=self.name,
            )

        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ProviderResponseError("response contained no choices", provider=self.name)

        choice = choices[0]
        if not isinstance(choice, dict):
            raise ProviderResponseError(
                f"choices[0] was {type(choice).__name__}, expected an object",
                provider=self.name,
            )

        message = choice.get("message")
        if isinstance(message, dict):
            text = self._content_text(message.get("content"))
            if text:
                return text

        # Older completions endpoints return the answer at choices[0].text.
        text = self._content_text(choice.get("text"))
        if text:
            return text

        raise ProviderResponseError(
            f"returned no usable text ({self._empty_detail(choice, message)})",
            provider=self.name,
            code="empty_response",
        )


class TokenHarborProvider(OpenAICompatibleProvider):
    """TokenHarbor's OpenAI-compatible endpoint (DeepSeek by default)."""

    name = "tokenharbor"

    @property
    def base_url(self) -> str:
        return settings.tokenharbor_base_url

    @property
    def api_key(self) -> str:
        return settings.tokenharbor_api_key

    @property
    def model(self) -> str:
        return settings.tokenharbor_model

    @property
    def default_temperature(self) -> float:
        return settings.tokenharbor_temperature

    @property
    def default_max_tokens(self) -> int:
        return settings.tokenharbor_max_tokens

    @property
    def timeout_seconds(self) -> float:
        return settings.tokenharbor_timeout_seconds


registry.register("tokenharbor", TokenHarborProvider)
