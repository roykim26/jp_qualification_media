from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

FactStatus = Literal[
    'draft',
    'pending_review',
    'approved',
    'rejected',
    'superseded',
    'withdrawn',
]
RiskLevel = Literal['low', 'medium', 'high', 'critical']
ValueType = Literal[
    'date',
    'datetime',
    'money',
    'integer',
    'decimal',
    'text',
    'boolean',
    'json',
]


class ParsedCandidate(BaseModel):
    """Candidate contract mirroring ``candidateFactSchema`` in ``packages/schema``."""

    model_config = ConfigDict(extra='forbid')

    fact_key: str = Field(min_length=1)
    exam_year: int = Field(gt=0)
    value_type: ValueType
    normalized_value: object
    display_value: str
    source_id: str = Field(min_length=1)
    source_snapshot_id: str = Field(min_length=1)
    provider_id: str | None = None
    exam_level_id: str | None = None
    exam_component: str | None = None
    delivery_mode: str | None = None
    payment_method: str | None = None
    risk_level: RiskLevel = 'high'
    status: FactStatus = 'pending_review'
    evidence_text: str | None = None
    synthetic: bool = True
