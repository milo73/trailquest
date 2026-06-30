"""Core domain models.

These types deliberately encode TrailQuest's central engineering constraint
(see ``CLAUDE.md`` and ``PRD.md`` §8): verifiable **ground truth** is kept
strictly separate from LLM-**generated** text, and questions are classified by
verifiability so that only questions whose answer lives in the data may *gate*
progress to the next stop.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class Theme(StrEnum):
    """Trail themes offered in the MVP (PRD §7.2)."""

    HISTORICAL = "historical"
    HIDDEN_GEMS = "hidden_gems"
    FAMILY = "family"
    ARCHITECTURE = "architecture"
    NATURE = "nature"
    MIXED = "mixed"


class SourceLicense(StrEnum):
    """Licenses of the data sources we carry attribution for (PRD §10)."""

    ODBL = "ODbL"  # OpenStreetMap
    CC0 = "CC0"  # Wikidata
    CC_BY_SA = "CC-BY-SA"  # Wikipedia


class Source(BaseModel):
    """Provenance for a single fact. Every factual claim must keep one of these."""

    name: str  # e.g. "Wikidata", "OpenStreetMap", "Wikipedia"
    license: SourceLicense
    reference: str  # stable id or URL, e.g. "wikidata:Q1234" or an article URL


class Fact(BaseModel):
    """A verifiable, *retrieved* fact — the source of truth.

    Generated text may rephrase these but must never invent new ones. A fact
    with no :attr:`source` must not be shown as a fact (PRD §8.3 grounding).
    """

    key: str  # e.g. "height_m", "build_year", "architect"
    value: str
    source: Source


class QuestionType(StrEnum):
    """Question types classified by verifiability (PRD §8.2).

    The classification — not the phrasing — decides whether a question may gate.
    """

    DATA_BOUND = "A"  # answer comes from retrieved data; question generated from it
    OBSERVE_COUNT = "B"  # observable only on-site; system cannot verify
    OPEN_REFLECTION = "C"  # no right/wrong
    RIDDLE_ON_FACT = "D"  # riddle whose solution is a Type-A fact

    @property
    def can_gate(self) -> bool:
        """Whether this type may automatically gate progress in the MVP.

        Only A and D (answer is in the data) gate on correctness. C always
        gates-through (any answer passes). B must never gate — honor system only.
        """
        return self in {
            QuestionType.DATA_BOUND,
            QuestionType.OPEN_REFLECTION,
            QuestionType.RIDDLE_ON_FACT,
        }

    @property
    def is_honor_system(self) -> bool:
        """Type B is asked, then revealed without a fail path (PRD §8.2)."""
        return self is QuestionType.OBSERVE_COUNT


class Question(BaseModel):
    """A puzzle/question attached to a stop.

    Invariants enforced at construction:
    - a gating type (A/D) must carry the verified ``answer`` it was built from;
    - a non-gating, non-reflection type (B) must not carry a fail path.
    """

    type: QuestionType
    prompt: str  # generated phrasing
    answer: str | None = None  # required for A/D; the value the question was built from
    hint: str | None = None
    # Derived, surfaced to the client so it never has to re-derive gating rules.
    gates: bool = Field(default=False)

    def model_post_init(self, __context: object) -> None:
        # The classification is the single source of truth for gating.
        gates = self.type.can_gate and self.type is not QuestionType.OPEN_REFLECTION
        object.__setattr__(self, "gates", gates)
        if self.gates and not self.answer:
            raise ValueError(f"gating question of type {self.type} must carry a verified answer")
        if self.type is QuestionType.OBSERVE_COUNT and self.gates:
            raise ValueError("Type B questions must never gate (honor system only)")


class GeoPoint(BaseModel):
    lat: float
    lon: float


class POI(BaseModel):
    """A point of interest, normalized from OSM/Wikidata/Wikipedia."""

    id: str
    name: str
    location: GeoPoint
    facts: list[Fact] = Field(default_factory=list)
    # Narrative background to paraphrase (Wikipedia, CC BY-SA). Not a verifiable
    # fact — it colours the story but never sources a gating answer (PRD §8.1).
    background: str | None = None
    background_source: Source | None = None

    @property
    def has_verifiable_facts(self) -> bool:
        """POIs without verifiable facts are skipped or get a non-factual story."""
        return len(self.facts) > 0


class Stop(BaseModel):
    """One stop on a trail: a POI plus its generated story and a question."""

    order: int
    poi: POI
    story: str  # LLM-generated narrative, grounded in poi.facts
    question: Question


class Trail(BaseModel):
    """A generated scavenger hunt: a loop of stops (start ≈ end, PRD §7.3)."""

    id: str
    city: str
    theme: Theme
    requested_distance_km: float
    actual_distance_km: float
    estimated_duration_min: int
    start: GeoPoint
    stops: list[Stop]
    # Attribution carried through to display (PRD §10).
    attributions: list[str] = Field(default_factory=list)


class TrailRequest(BaseModel):
    """Inputs for trail generation (PRD §7.1–7.2). Distance-based only in MVP (§19)."""

    start: GeoPoint
    distance_km: float = Field(ge=1, le=25)  # min/max bounds per PRD §7.2
    theme: Theme = Theme.MIXED


# Maximum wrong attempts before the answer is revealed and the trail continues.
# Stops are not skippable (PRD §19).
MAX_ATTEMPTS_BEFORE_REVEAL = 3


class AnswerRequest(BaseModel):
    stop_order: int
    answer: str
    attempt: int = Field(ge=1)  # 1-based attempt number


class AnswerResult(BaseModel):
    correct: bool
    unlocked_next: bool  # whether the next stop is now unlocked
    revealed_answer: str | None = None  # set once attempts are exhausted or honor-system reveal
    feedback: str


class DraftStatus(StrEnum):
    """Lifecycle of a creator's draft trail (pre-publication)."""

    CONCEPT = "concept"
    REVIEW = "review"
    PUBLISHED = "published"


class DraftStop(BaseModel):
    """A stop on a draft trail. Unlike a player-facing ``Stop``, the generated
    ``story``/``question`` are optional — they are authored later in the studio."""

    order: int
    poi: POI
    story: str | None = None
    question: Question | None = None


class DraftTrail(BaseModel):
    """A creator's work-in-progress trail. The player never sees this; only a
    published ``Trail`` (with fully-grounded ``Stop``s) is playable."""

    id: str
    title: str
    city: str
    theme: Theme
    start: GeoPoint
    requested_distance_km: float
    actual_distance_km: float
    estimated_duration_min: int
    stops: list[DraftStop] = Field(default_factory=list)
    status: DraftStatus = DraftStatus.CONCEPT
    attributions: list[str] = Field(default_factory=list)


class DraftCreate(BaseModel):
    title: str | None = None
    start: GeoPoint
    distance_km: float = Field(default=5, ge=1, le=25)
    theme: Theme = Theme.MIXED
    from_concept: bool = False


class DraftUpdate(BaseModel):
    title: str | None = None
    theme: Theme | None = None
    status: DraftStatus | None = None
    # Full ordered list of POI ids the draft should now contain (add/remove/reorder
    # in one idempotent update). None means "leave stops unchanged".
    stop_poi_ids: list[str] | None = None


class RouteMeasureRequest(BaseModel):
    start: GeoPoint
    points: list[GeoPoint] = Field(default_factory=list)


class RouteMeasureResult(BaseModel):
    distance_km: float
    duration_min: int
