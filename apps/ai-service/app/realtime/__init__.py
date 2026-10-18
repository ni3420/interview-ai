"""Realtime vision-agent runtime for live interviews.

The heavy ``vision-agents`` dependencies are optional (the ``realtime`` extra)
and are imported lazily by :mod:`app.realtime.runner`, so the core API service
and its unit tests run without them installed.
"""

from app.realtime.manager import RealtimeAgentManager, realtime_agent_manager
from app.realtime.runner import RealtimeRuntimeUnavailableError

__all__ = [
    "RealtimeAgentManager",
    "RealtimeRuntimeUnavailableError",
    "realtime_agent_manager",
]
