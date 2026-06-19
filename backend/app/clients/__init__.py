"""HTTP clients for external data and routing sources (PRD §10).

Each client is thin and raises :class:`ClientError` on any failure (network,
rate-limit, malformed payload) so the service layer can fall back cleanly —
prefer a degraded-but-correct result over a wrong one (PRD §8.3, §13).
"""

from __future__ import annotations


class ClientError(RuntimeError):
    """Raised when an upstream source is unavailable or returns bad data."""
