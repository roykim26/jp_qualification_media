"""Aggregated registry of every registered official source URL.

Patrol reads this registry instead of the database so capture never needs a
database connection.  URLs come verbatim from the six per-qualification
registries and the capture-only evidence lists; nothing is added or rewritten
here.  ``STATISTICS_UNIFIED_SOURCES`` is a dimension mapping, not a URL list,
so it is intentionally not aggregated.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from urllib.parse import urlsplit

from collector.bookkeeping import BOOKKEEPING_SOURCES
from collector.capture_fp import DIRECTLY_CITED_CAPTURE_SOURCES as FP_CAPTURE_ONLY
from collector.capture_takken import (
    DIRECTLY_CITED_CAPTURE_DOCUMENTS as TAKKEN_CAPTURE_DOCUMENTS,
)
from collector.capture_takken import (
    DIRECTLY_CITED_CAPTURE_SOURCES as TAKKEN_CAPTURE_ONLY,
)
from collector.fp import FP_SOURCES
from collector.fundamental_it import FUNDAMENTAL_IT_SOURCES
from collector.gyoseishoshi import GYoseishoshi_SOURCES
from collector.it_passport import IT_PASSPORT_SOURCES
from collector.takken import TAKKEN_SOURCE


@dataclass(frozen=True)
class RegisteredSource:
    source_id: str
    qualification: str
    canonical_url: str
    allowed_domain: str
    kind: str
    snapshot_dir: str
    capture_only: bool = False


def build_registry() -> dict[str, RegisteredSource]:
    registry: dict[str, RegisteredSource] = {}

    def add(
        source_id: str,
        qualification: str,
        canonical_url: str,
        snapshot_dir: str,
        *,
        allowed_domain: str | None = None,
        capture_only: bool = False,
    ) -> None:
        if source_id in registry:
            if registry[source_id].canonical_url != canonical_url:
                raise ValueError(f"conflicting registration for {source_id}")
            return
        domain = allowed_domain or (urlsplit(canonical_url).hostname or "")
        kind = "pdf" if urlsplit(canonical_url).path.lower().endswith(".pdf") else "html"
        registry[source_id] = RegisteredSource(
            source_id=source_id,
            qualification=qualification,
            canonical_url=canonical_url,
            allowed_domain=domain,
            kind=kind,
            snapshot_dir=snapshot_dir,
            capture_only=capture_only,
        )

    for source_id, source in FUNDAMENTAL_IT_SOURCES.items():
        add(source_id, "fundamental-it-engineer", source["canonical_url"], "fundamental-it", allowed_domain=source["allowed_domain"])
    for source_id, source in IT_PASSPORT_SOURCES.items():
        add(source_id, "it-passport", source["canonical_url"], "it-passport", allowed_domain=source["allowed_domain"])
    for source_id, source in GYoseishoshi_SOURCES.items():
        add(source_id, "gyoseishoshi", source["canonical_url"], "gyoseishoshi", allowed_domain=source["allowed_domain"])
    for source_id, (url, _provider) in FP_SOURCES.items():
        add(source_id, "fp", url, "fp")
    for source_id, (url, _provider, _suffix) in FP_CAPTURE_ONLY.items():
        add(source_id, "fp", url, "fp", capture_only=True)
    for source_id, (url, _scope) in BOOKKEEPING_SOURCES.items():
        add(source_id, "bookkeeping", url, "bookkeeping")
    add(TAKKEN_SOURCE["id"], "takken", TAKKEN_SOURCE["canonical_url"], "takken", allowed_domain=TAKKEN_SOURCE["allowed_domain"])
    for source_id, url in TAKKEN_CAPTURE_ONLY.items():
        add(source_id, "takken", url, "takken", capture_only=True)
    for source_id, (url, _suffix) in TAKKEN_CAPTURE_DOCUMENTS.items():
        add(source_id, "takken", url, "takken", capture_only=True)
    return registry


def registry_json() -> dict[str, dict[str, object]]:
    return {source_id: asdict(source) for source_id, source in build_registry().items()}


if __name__ == "__main__":
    print(json.dumps(registry_json(), ensure_ascii=False, indent=2))