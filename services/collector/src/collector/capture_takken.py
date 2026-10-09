"""Controlled live capture for the registered 宅建 official page.

This command is capture-only: it never connects to PostgreSQL or creates
candidate facts.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from collector.http_policy import SafeFetcher, SourcePolicy
from collector.takken import TAKKEN_SOURCE


CAPTURE_ROOT = Path("var/official-snapshots/takken")

DIRECTLY_CITED_CAPTURE_SOURCES = {
    "capture-only:takken:exam-detail": "https://www.retio.or.jp/exam/exam_detail",
    "capture-only:takken:schedule": "https://www.retio.or.jp/exam/schedule/",
    "capture-only:takken:postal-application": "https://www.retio.or.jp/exam/siken_postinfo/",
    "capture-only:takken:faq": "https://www.retio.or.jp/exam/faq/",
    "capture-only:takken:past-questions": "https://www.retio.or.jp/exam/past_ques_ans/other/",
    "capture-only:takken:registration-course": "https://www.retio.or.jp/exam/tourokukosyu/",
}
DIRECTLY_CITED_CAPTURE_DOCUMENTS = {
    "capture-only:takken:2026-internet-application-guide": (
        "https://www.retio.or.jp/wp-content/uploads/2026/05/R8インターネット申込試験案内.pdf",
        ".pdf",
    ),
}


def capture_registered_source(output_root: str | Path = CAPTURE_ROOT) -> dict[str, object]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("takken live capture refuses NODE_ENV=production")
    if os.getenv("TAKKEN_LIVE_AUTHORIZED") != "1":
        raise RuntimeError("set TAKKEN_LIVE_AUTHORIZED=1 to authorize official-page capture")

    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    fetcher = SafeFetcher(
        SourcePolicy(TAKKEN_SOURCE["id"], frozenset({TAKKEN_SOURCE["allowed_domain"]})),
    )
    try:
        fetched = fetcher.fetch(TAKKEN_SOURCE["canonical_url"])
    finally:
        fetcher.close()

    item: dict[str, object] = {
        "source_id": TAKKEN_SOURCE["id"],
        "url": fetched.url,
        "status": fetched.status,
        "status_code": fetched.status_code,
        "attempts": fetched.attempts,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    if fetched.body is not None and fetched.status in {"ok", "not_modified"}:
        digest = sha256(fetched.body).hexdigest()
        path = root / f"{digest}.html"
        if not path.exists():
            path.write_bytes(fetched.body)
        item.update(content_hash=digest, bytes=len(fetched.body), snapshot_path=str(path))
    if fetched.error:
        item["error"] = fetched.error

    report = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "source_count": 1,
        "results": [item],
        "candidate_ingest": "not_run",
    }
    (root / "capture-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def capture_directly_cited_sources(
    output_root: str | Path = CAPTURE_ROOT,
    source_ids: tuple[str, ...] = tuple(DIRECTLY_CITED_CAPTURE_SOURCES),
) -> dict[str, object]:
    """Capture only explicit same-domain links from the saved official root page."""
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("takken live capture refuses NODE_ENV=production")
    if os.getenv("TAKKEN_LIVE_AUTHORIZED") != "1":
        raise RuntimeError("set TAKKEN_LIVE_AUTHORIZED=1 to authorize official-page capture")
    unknown = set(source_ids) - set(DIRECTLY_CITED_CAPTURE_SOURCES)
    if unknown:
        raise ValueError(f"unregistered directly cited Takken source: {sorted(unknown)!r}")
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    for source_id in source_ids:
        fetcher = SafeFetcher(
            SourcePolicy(source_id, frozenset({TAKKEN_SOURCE["allowed_domain"]}))
        )
        try:
            fetched = fetcher.fetch(DIRECTLY_CITED_CAPTURE_SOURCES[source_id])
        finally:
            fetcher.close()
        item: dict[str, object] = {
            "source_id": source_id,
            "url": fetched.url,
            "status": fetched.status,
            "status_code": fetched.status_code,
            "attempts": fetched.attempts,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
        if fetched.body is not None and fetched.status in {"ok", "not_modified"}:
            digest = sha256(fetched.body).hexdigest()
            path = root / f"{digest}.html"
            if not path.exists():
                path.write_bytes(fetched.body)
            item.update(content_hash=digest, bytes=len(fetched.body), snapshot_path=str(path))
        if fetched.error:
            item["error"] = fetched.error
        results.append(item)
    report = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(results),
        "results": results,
        "candidate_ingest": "not_run",
    }
    (root / "directly-cited-capture-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def capture_directly_cited_documents(output_root: str | Path = CAPTURE_ROOT) -> dict[str, object]:
    """Capture the explicitly authorized official PDF without creating facts."""
    if (
        os.getenv("NODE_ENV", "development") == "production"
        or os.getenv("TAKKEN_LIVE_AUTHORIZED") != "1"
    ):
        raise RuntimeError("explicit non-production Takken capture authorization required")
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    source_id, (url, suffix) = next(iter(DIRECTLY_CITED_CAPTURE_DOCUMENTS.items()))
    fetcher = SafeFetcher(
        SourcePolicy(source_id, frozenset({TAKKEN_SOURCE["allowed_domain"]}))
    )
    try:
        fetched = fetcher.fetch(url)
    finally:
        fetcher.close()
    item: dict[str, object] = {
        "source_id": source_id,
        "url": fetched.url,
        "status": fetched.status,
        "status_code": fetched.status_code,
        "attempts": fetched.attempts,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    if fetched.body is not None and fetched.status in {"ok", "not_modified"}:
        digest = sha256(fetched.body).hexdigest()
        path = root / f"{digest}{suffix}"
        if not path.exists():
            path.write_bytes(fetched.body)
        item.update(content_hash=digest, bytes=len(fetched.body), snapshot_path=str(path))
    if fetched.error:
        item["error"] = fetched.error
    report = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "source_count": 1,
        "results": [item],
        "candidate_ingest": "not_run",
    }
    (root / "directly-cited-document-capture-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    print(json.dumps(capture_registered_source(), ensure_ascii=False, indent=2))
