"""Controlled live capture for registered 行政書士 official pages.

This command is capture-only: it never connects to PostgreSQL or creates
candidate facts.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from collector.gyoseishoshi import GYoseishoshi_SOURCES
from collector.http_policy import SafeFetcher, SourcePolicy


CAPTURE_ROOT = Path("var/official-snapshots/gyoseishoshi")


def capture_registered_sources(output_root: str | Path = CAPTURE_ROOT) -> dict[str, object]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("gyoseishoshi live capture refuses NODE_ENV=production")
    if os.getenv("GYOSEISHOSHI_LIVE_AUTHORIZED") != "1":
        raise RuntimeError(
            "set GYOSEISHOSHI_LIVE_AUTHORIZED=1 to authorize official-page capture"
        )

    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    for source_id, source in GYoseishoshi_SOURCES.items():
        fetcher = SafeFetcher(SourcePolicy(source_id, frozenset({source["allowed_domain"]})))
        try:
            fetched = fetcher.fetch(source["canonical_url"])
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
            path = root / f"{source_id.rsplit(':', 1)[-1]}.html"
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
    (root / "capture-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    print(json.dumps(capture_registered_sources(), ensure_ascii=False, indent=2))
