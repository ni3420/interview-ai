import asyncio

import pytest

from app.realtime.watchdog import SessionWatchdog


class FakeLLM:
    def __init__(self, connected: bool = True):
        self.connected = connected
        self.connect_calls = 0
        self.close_calls = 0
        self.fail_next = 0

    async def connect(self) -> None:
        self.connect_calls += 1
        if self.fail_next:
            self.fail_next -= 1
            raise RuntimeError("provider unavailable")
        self.connected = True

    async def close(self) -> None:
        self.close_calls += 1
        self.connected = False


async def run_briefly(watchdog: SessionWatchdog, task) -> None:
    await asyncio.sleep(0.05)
    watchdog.stop()
    await asyncio.wait_for(task, timeout=2)


class TestSessionWatchdog:
    @pytest.mark.asyncio
    async def test_reconnects_a_dropped_session(self):
        llm = FakeLLM()
        watchdog = SessionWatchdog(
            llm, call_id="c", poll_interval_s=0.01, delays=(0.01,)
        )

        task = asyncio.create_task(watchdog.run())
        await asyncio.sleep(0.02)
        llm.connected = False
        await asyncio.sleep(0.1)
        watchdog.stop()
        await asyncio.wait_for(task, timeout=2)

        assert llm.connect_calls == 1
        assert watchdog.reconnects == 1
        assert watchdog.gave_up is False

    @pytest.mark.asyncio
    async def test_leaves_a_healthy_session_alone(self):
        llm = FakeLLM()
        watchdog = SessionWatchdog(
            llm, call_id="c", poll_interval_s=0.01, delays=(0.01,)
        )

        await run_briefly(watchdog, asyncio.create_task(watchdog.run()))

        assert llm.connect_calls == 0

    @pytest.mark.asyncio
    async def test_retries_then_gives_up(self):
        llm = FakeLLM()
        llm.connected = False
        llm.fail_next = 10
        watchdog = SessionWatchdog(
            llm, call_id="c", poll_interval_s=0.01, delays=(0.01, 0.01)
        )

        task = asyncio.create_task(watchdog.run())
        await asyncio.sleep(0.2)
        watchdog.stop()
        await asyncio.wait_for(task, timeout=2)

        assert llm.connect_calls == 2
        assert watchdog.reconnects == 0
        assert watchdog.gave_up is True

    @pytest.mark.asyncio
    async def test_stop_prevents_further_attempts(self):
        llm = FakeLLM()
        llm.connected = False
        watchdog = SessionWatchdog(
            llm, call_id="c", poll_interval_s=0.01, delays=(0.2,)
        )

        task = asyncio.create_task(watchdog.run())
        await asyncio.sleep(0.02)
        watchdog.stop()
        await asyncio.wait_for(task, timeout=2)

        assert llm.connect_calls == 0

    @pytest.mark.asyncio
    async def test_closes_a_session_that_reconnects_while_stopping(self):
        # The call can end while a reconnect is in flight; reviving the session
        # would leave a paid provider socket open after the interview.
        class SlowConnectLLM(FakeLLM):
            def __init__(self):
                super().__init__(connected=False)
                self.connect_started = asyncio.Event()

            async def connect(self) -> None:
                self.connect_started.set()
                await asyncio.sleep(0.05)
                await super().connect()

        llm = SlowConnectLLM()
        watchdog = SessionWatchdog(
            llm, call_id="c", poll_interval_s=0.01, delays=(0.01,)
        )

        task = asyncio.create_task(watchdog.run())
        await asyncio.wait_for(llm.connect_started.wait(), timeout=2)
        watchdog.stop()
        await asyncio.wait_for(task, timeout=2)

        assert llm.close_calls == 1
        assert llm.connected is False
        assert watchdog.reconnects == 0
