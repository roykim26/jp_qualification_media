from dataclasses import dataclass

@dataclass(frozen=True)
class SnapshotCandidate:
    source_id: str
    content_hash: str
    object_key: str
    synthetic: bool = False

class CollectorAdapter:
    """Stage-0 interface only; no network collection is implemented."""
    def collect(self) -> SnapshotCandidate:
        raise NotImplementedError
