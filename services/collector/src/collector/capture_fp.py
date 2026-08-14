"""Controlled live capture for registered FP技能検定 official pages."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from collector.fp import FP_SOURCES
from collector.http_policy import SafeFetcher, SourcePolicy

CAPTURE_ROOT = Path("var/official-snapshots/fp")


def capture_registered_sources(output_root: str | Path = CAPTURE_ROOT) -> dict[str, object]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("FP live capture refuses NODE_ENV=production")
    if os.getenv("FP_LIVE_AUTHORIZED") != "1":
        raise RuntimeError("set FP_LIVE_AUTHORIZED=1 to authorize official-page capture")
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    for source_id, (url, provider) in FP_SOURCES.items():
        host = "www.jafp.or.jp" if provider == "jafp" else "www.kinzai.or.jp"
        fetcher = SafeFetcher(SourcePolicy(source_id, frozenset({host})))
        try:
            fetched = fetcher.fetch(url)
            item: dict[str, object] = {"source_id": source_id, "provider_id": provider, "url": fetched.url, "status": fetched.status, "status_code": fetched.status_code, "attempts": fetched.attempts, "captured_at": datetime.now(timezone.utc).isoformat()}
            if fetched.body is not None and fetched.status in {"ok", "not_modified"}:
                digest = sha256(fetched.body).hexdigest()
                path = root / f"{source_id.removeprefix('source:fp:')}.html"
                path.write_bytes(fetched.body)
                item.update(content_hash=digest, bytes=len(fetched.body), snapshot_path=str(path))
            if fetched.error:
                item["error"] = fetched.error
            results.append(item)
        finally:
            fetcher.close()
    report = {"captured_at": datetime.now(timezone.utc).isoformat(), "source_count": len(results), "results": results, "candidate_ingest": "not_run"}
    (root / "capture-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(capture_registered_sources(), ensure_ascii=False, indent=2))
