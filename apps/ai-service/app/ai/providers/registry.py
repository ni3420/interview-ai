"""Name -> adapter registry.

Adapters register themselves when their module is imported. The factory and
health service look providers up by name, so business logic never imports a
vendor module. Adding a provider is: create the adapter, register it in its
module, add one import to ``app.ai.providers.__init__``, and add its settings.
"""

from __future__ import annotations

from collections.abc import Callable

from app.ai.providers.base import BaseChatProvider, ProviderConfigurationError

ProviderFactory = Callable[[], BaseChatProvider]


class ProviderRegistry:
    def __init__(self) -> None:
        self._factories: dict[str, ProviderFactory] = {}
        self._instances: dict[str, BaseChatProvider] = {}

    def register(self, name: str, factory: ProviderFactory) -> None:
        key = name.strip().lower()
        if not key:
            raise ProviderConfigurationError("AI provider name must not be empty")
        existing = self._factories.get(key)
        if existing is not None and existing is not factory:
            raise ProviderConfigurationError(f"AI provider already registered: {key}")
        self._factories[key] = factory

    def get(self, name: str) -> BaseChatProvider:
        key = name.strip().lower()
        factory = self._factories.get(key)
        if factory is None:
            raise ProviderConfigurationError(f"Unsupported AI provider: {name}")

        instance = self._instances.get(key)
        if instance is None:
            instance = factory()
            self._instances[key] = instance
        return instance

    def has(self, name: str) -> bool:
        return name.strip().lower() in self._factories

    def names(self) -> tuple[str, ...]:
        return tuple(self._factories)

    def clear(self) -> None:
        """Test hook: drop instances but keep registrations."""
        self._instances.clear()


registry = ProviderRegistry()
