"""Gamification (PRD §7.5).

Points per solved question with a bonus for solving without a hint / in one
attempt. Kept intentionally small for the skeleton; badges, history, and the
user service come later. The rule that matters: gamification must never dead-end
the player (that is enforced in :mod:`app.services.answer_service`).
"""

from __future__ import annotations

BASE_POINTS = 10
FIRST_TRY_BONUS = 5
NO_HINT_BONUS = 3


def points_for(*, correct: bool, attempt: int, used_hint: bool) -> int:
    """Score a solved question. Revealed (not correct) answers earn nothing."""
    if not correct:
        return 0
    points = BASE_POINTS
    if attempt == 1:
        points += FIRST_TRY_BONUS
    if not used_hint:
        points += NO_HINT_BONUS
    return points
