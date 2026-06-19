"""Tests for gating behaviour: 3 attempts then reveal, no dead ends (PRD §13, §19)."""

from __future__ import annotations

from app.models.schemas import Question, QuestionType
from app.services import answer_service


def _data_question() -> Question:
    return Question(
        type=QuestionType.DATA_BOUND,
        prompt="How tall is the tower, in metres?",
        answer="78",
        hint="It relates to height.",
    )


def test_correct_answer_unlocks_next() -> None:
    result = answer_service.evaluate(_data_question(), "78", attempt=1)
    assert result.correct and result.unlocked_next


def test_answer_match_is_case_and_space_insensitive() -> None:
    q = Question(type=QuestionType.DATA_BOUND, prompt="Architect?", answer="Lieven de Key")
    assert answer_service.evaluate(q, "  lieven de key ", attempt=1).correct


def test_first_wrong_attempt_gives_hint_and_does_not_unlock() -> None:
    result = answer_service.evaluate(_data_question(), "10", attempt=1)
    assert not result.correct
    assert not result.unlocked_next
    assert "Hint" in result.feedback


def test_third_attempt_reveals_answer_and_unlocks() -> None:
    result = answer_service.evaluate(_data_question(), "wrong", attempt=3)
    assert not result.correct
    assert result.unlocked_next  # no dead end
    assert result.revealed_answer == "78"


def test_reflection_always_passes() -> None:
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="Thoughts?")
    result = answer_service.evaluate(q, "anything", attempt=1)
    assert result.correct and result.unlocked_next


def test_observe_count_is_honor_system() -> None:
    q = Question(type=QuestionType.OBSERVE_COUNT, prompt="How many lions?")
    result = answer_service.evaluate(q, "4", attempt=1)
    assert result.unlocked_next  # never blocks
    assert result.correct
