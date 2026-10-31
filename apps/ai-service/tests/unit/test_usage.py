import pytest

from app.core import metrics
from app.core.config import settings


@pytest.fixture
def events(monkeypatch):
    captured: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        metrics, "log_event", lambda message, **fields: captured.append((message, fields))
    )
    return captured


class TestUsageContext:
    def test_attributes_usage_to_operation_and_interview(self, events):
        with metrics.usage_context("report", interview_id="interview-1"):
            metrics.record_usage(
                provider="gemini",
                model="gemini-test",
                prompt_tokens=1000,
                completion_tokens=250,
            )

        assert events == [
            (
                "model usage",
                {
                    "operation": "report",
                    "provider": "gemini",
                    "model": "gemini-test",
                    "promptTokens": 1000,
                    "completionTokens": 250,
                    "totalTokens": 1250,
                    "estimatedCostUsd": None,
                    "interviewId": "interview-1",
                },
            )
        ]

    def test_context_is_reset_after_the_block(self, events):
        with metrics.usage_context("plan", interview_id="interview-1"):
            pass

        metrics.record_usage(
            provider="ollama", model="m", prompt_tokens=1, completion_tokens=2
        )

        fields = events[0][1]
        assert fields["operation"] == "unknown"
        assert "interviewId" not in fields

    def test_missing_token_counts_stay_null(self, events):
        metrics.record_usage(
            provider="gemini",
            model="gemini-test",
            prompt_tokens=None,
            completion_tokens=None,
        )

        fields = events[0][1]
        assert fields["totalTokens"] is None
        assert fields["estimatedCostUsd"] is None


class TestEstimatedCost:
    def test_uses_operator_configured_prices(self, monkeypatch):
        monkeypatch.setattr(settings, "gemini_input_price_per_1m", 2.0)
        monkeypatch.setattr(settings, "gemini_output_price_per_1m", 8.0)

        # 0.5M input at $2/1M + 0.25M output at $8/1M
        assert metrics.estimated_cost_usd("gemini", 500_000, 250_000) == 3.0

    def test_requires_both_prices(self, monkeypatch):
        monkeypatch.setattr(settings, "gemini_input_price_per_1m", 2.0)
        monkeypatch.setattr(settings, "gemini_output_price_per_1m", None)
        assert metrics.estimated_cost_usd("gemini", 1000, 1000) is None

    def test_local_ollama_has_no_marginal_cost(self):
        assert metrics.estimated_cost_usd("ollama", None, None) == 0.0

    def test_unknown_provider_has_no_estimate(self):
        assert metrics.estimated_cost_usd("other", 1000, 1000) is None
