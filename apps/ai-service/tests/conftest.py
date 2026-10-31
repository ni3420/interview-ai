import os
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# Settings refuse to load without a service key. Tests are a development
# environment, so give them the development key unless the runner set one.
os.environ.setdefault("SERVICE_API_KEY", "dev-secret-key")
os.environ.setdefault("APP_ENV", "development")

pytest_plugins = ["pytest_asyncio"]

@pytest.fixture(scope="session")
def event_loop():
    import asyncio
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()