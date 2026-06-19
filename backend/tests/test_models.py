"""Tests for the gating invariants baked into the domain model (PRD §8.2)."""

from __future__ import annotations

import pytest

from app.models.schemas import Question, QuestionType


def test_data_bound_question_gates_and_requires_answer() -> None:
    q = Question(type=QuestionType.DATA_BOUND, prompt="How tall?", answer="78")
    assert q.gates is True


def test_gating_question_without_answer_is_rejected() -> None:
    with pytest.raises(ValueError):
        Question(type=QuestionType.DATA_BOUND, prompt="How tall?")


def test_observe_count_never_gates() -> None:
    q = Question(type=QuestionType.OBSERVE_COUNT, prompt="How many lions?")
    assert q.gates is False
    assert q.type.is_honor_system is True


def test_reflection_does_not_gate_on_correctness() -> None:
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="What stood here?")
    assert q.gates is False  # always let through, not a correctness gate


def test_can_gate_classification() -> None:
    assert QuestionType.DATA_BOUND.can_gate
    assert QuestionType.RIDDLE_ON_FACT.can_gate
    assert not QuestionType.OBSERVE_COUNT.can_gate
