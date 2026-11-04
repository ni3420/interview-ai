"""Chat provider package.

Importing any submodule registers the built-in adapters. Business logic should
import ``get_llm_provider`` from ``app.ai.providers.factory`` instead of the
vendor modules.
"""

from app.ai.providers.base import (
    AllProvidersFailedError,
    BaseChatProvider,
    ChatBatchResponse,
    ChatRequest,
    ChatResponse,
    LLMProvider,
    NoProviderAvailableError,
    ProviderCapabilities,
    ProviderConfigurationError,
    ProviderDescription,
    ProviderFailure,
    TokenUsage,
)
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.ollama import OllamaProvider
from app.ai.providers.openai_compatible import (
    OpenAICompatibleProvider,
    TokenHarborProvider,
)

__all__ = [
    "AllProvidersFailedError",
    "BaseChatProvider",
    "ChatBatchResponse",
    "ChatRequest",
    "ChatResponse",
    "GeminiProvider",
    "LLMProvider",
    "NoProviderAvailableError",
    "OllamaProvider",
    "OpenAICompatibleProvider",
    "ProviderCapabilities",
    "ProviderConfigurationError",
    "ProviderDescription",
    "ProviderFailure",
    "TokenHarborProvider",
    "TokenUsage",
]
