"""Root test configuration.

Force offline, in-memory defaults for the whole test suite BEFORE any app module
(and thus the settings singleton) is imported. Real environment variables take
precedence over the repo `.env`, so setting them here isolates tests from a
developer's local `.env` (which may enable claude_cli / live POIs / sqlite / file
stores). This runs first because pytest imports the rootdir conftest before test
modules and their `app` imports.
"""

from __future__ import annotations

import os

os.environ["TRAILQUEST_LLM_PROVIDER"] = "stub"
os.environ["TRAILQUEST_POI_SOURCE"] = "seed"
os.environ["TRAILQUEST_CONTENT_STORE"] = "memory"
os.environ["TRAILQUEST_DRAFT_STORE"] = "memory"
os.environ["TRAILQUEST_PUBLISHED_STORE"] = "memory"
os.environ["TRAILQUEST_ROUTING_PROVIDER"] = "none"
