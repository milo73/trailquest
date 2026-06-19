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
)


def _normalize(text: str) -> str:
    return text.strip().casefold()


def evaluate(question: Question, submitted: str, attempt: int) -> AnswerResult:
    """Evaluate a submitted answer for a given attempt (1-based)."""
    if question.type is QuestionType.OPEN_REFLECTION:
        return AnswerResult(
            correct=True,
            unlocked_next=True,
            feedback="Thanks for sharing — there's no wrong answer here.",
        )

    if question.type is QuestionType.OBSERVE_COUNT:
        # Honor system: reveal without a fail path, never gates.
        return AnswerResult(
            correct=True,
            unlocked_next=True,
            revealed_answer=question.answer,
            feedback="Nicely spotted! (We trust your count on this one.)",
        )

    # Type A / D: gate on correctness.
    assert question.answer is not None  # guaranteed by Question invariants
    is_correct = _normalize(submitted) == _normalize(question.answer)
    if is_correct:
        return AnswerResult(
            correct=True, unlocked_next=True, feedback="Correct! On to the next stop."
        )

    if attempt >= MAX_ATTEMPTS_BEFORE_REVEAL:
        return AnswerResult(
            correct=False,
            unlocked_next=True,
            revealed_answer=question.answer,
            feedback=f"The answer was: {question.answer}. Let's keep going.",
        )

    feedback = "Not quite."
    if attempt == 1 and question.hint:
        feedback = f"Not quite. Hint: {question.hint}"
    return AnswerResult(correct=False, unlocked_next=False, feedback=feedback)
