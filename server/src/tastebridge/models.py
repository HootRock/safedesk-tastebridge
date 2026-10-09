from datetime import datetime
from typing import Literal
from pydantic import Field
from hackathon_core.contracts import StrictModel

EntityKind=Literal["movie","artist"]
class EntityChoice(StrictModel):
    entity_id: str
    name: str
    kind: EntityKind
    year: int | None = None

class MovieCandidate(StrictModel):
    entity_id: str
    name: str
    metadata: dict = Field(default_factory=dict)
    rank: int
    explainability: dict | list | None = None

class QlooMovieResponse(StrictModel):
    movies: list[MovieCandidate]
    warnings: list[str]
    fetched_at: datetime

class GroupRankingItem(StrictModel):
    entity_id: str
    score: float
    mean_utility: float
    min_utility: float
    ranks: dict[str,int|None]
class EvidenceRef(StrictModel):
    evidence_id: str
    member_id: str
    entity_id: str
    kind: str
    value: int | dict | list
class MemberPreference(StrictModel):
    member_id: str = Field(min_length=1,max_length=40)
    nickname: str = Field(min_length=1,max_length=40)
    entity_ids: list[str]
class GroupSession(StrictModel):
    session_id: str
    version: int
    members: list[MemberPreference]
    excluded_ids: list[str]
    feedback_rounds: int
    updated_at: datetime
class GroupCandidate(StrictModel):
    entity_id: str
    name: str
    metadata: dict
    ranking: GroupRankingItem
class RecommendationRun(StrictModel):
    run_id: str
    session_id: str
    group_version: int
    status: str
    candidates: list[GroupCandidate] = Field(default_factory=list)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)
    events: list = Field(default_factory=list)
    mode: str = "live"
    error_code: str | None = None
    fetched_at: datetime | None = None
    counters: dict = Field(default_factory=dict)
