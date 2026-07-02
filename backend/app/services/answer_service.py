"""Answer handling and gating (PRD §7.4, §13, §19).

Encodes the gating rules in one place:
- Type A/D gate on correctness; after :data:`MAX_ATTEMPTS_BEFORE_REVEAL` wrong
  attempts the answer is revealed and the trail continues (no dead end).
- Type C (reflection) always lets the player through.
- Type B is honor-system: the player is asked, then the answer is revealed
  without a fail path.
Stops are not skippable.
"""

from __future__ import annotations

from app.models.schemas import (
    MAX_ATTEMPTS_BEFORE_REVEAL,
    AnswerResult,
    Question,
    QuestionType,
    Stop,
)


def _normalize(text: str) -> str:
    return text.strip().casefold()


def evaluate(question: Question, submitted: str, attempt: int) -> AnswerResult:
    """Evaluate a submitted answer for a given attempt (1-based)."""
    if question.type is QuestionType.OPEN_REFLECTION:
        return AnswerResult(
            correct=True,
            unlocked_next=True,
            feedback="Bedankt voor het delen — hier is geen fout antwoord.",
        )

    if question.type is QuestionType.OBSERVE_COUNT:
        # Honor system: reveal without a fail path, never gates.
        return AnswerResult(
            correct=True,
            unlocked_next=True,
            revealed_answer=question.answer,
            feedback="Goed gespot! (We vertrouwen je telling hier.)",
        )

    # Type A / D: gate on correctness.
    assert question.answer is not None  # guaranteed by Question invariants
    is_correct = _normalize(submitted) == _normalize(question.answer)
    if is_correct:
        return AnswerResult(
            correct=True, unlocked_next=True, feedback="Correct! Door naar de volgende stop."
        )

    if attempt >= MAX_ATTEMPTS_BEFORE_REVEAL:
        return AnswerResult(
            correct=False,
            unlocked_next=True,
            revealed_answer=question.answer,
            feedback=f"Het antwoord was: {question.answer}. We gaan verder.",
        )

    feedback = "Net niet."
    if attempt == 1 and question.hint:
        feedback = f"Net niet. Tip: {question.hint}"
    return AnswerResult(correct=False, unlocked_next=False, feedback=feedback)


def evaluate_in_stop(
    stop: Stop, question_index: int | None, submitted: str, attempt: int
) -> AnswerResult:
    """Evaluate an answer for a specific question in a stop. Only the primary
    question gates; bonus questions return feedback but never unlock the next stop."""
    idx = question_index if question_index is not None else stop.primary_question_index
    result = evaluate(stop.questions[idx], submitted, attempt)
    if idx != stop.primary_question_index:
        return result.model_copy(update={"unlocked_next": False})
    return result
