from pydantic import BaseModel, ConfigDict

class ParsedCandidate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    fact_key: str
    value_type: str
    normalized_value: object
    display_value: str
    synthetic: bool = True
