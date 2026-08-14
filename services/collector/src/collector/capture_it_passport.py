"""Controlled live capture for registered IT Passport official pages.

This command is capture-only: it writes local HTML snapshots and a JSON
report, never database candidates.  Explicit authorization is required.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from collector.http_policy import SafeFetcher, SourcePolicy
from collector.it_passport import IT_PASSPORT_SOURCES


CAPTURE_ROOT = Path("var/official-snapshots/it-passport")
REPORT_PATH = CAPTURE_ROOT / "capture-report.json"


def capture_registered_sources(
    output_root: str | Path = CAPTURE_ROOT,
) -> dict[str, object]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("live capture refuses NODE_ENV=production")
    if os.getenv("IT_PASSPORT_LIVE_AUTHORIZED") != "1":
        raise RuntimeError(
            "set IT_PASSPORT_LIVE_AUTHORIZED=1 after completing the authorization checklist"
        )
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    for source_id, source in IT_PASSPORT_SOURCES.items():
        policy = SourcePolicy(
            source_id=source_id,
            allowed_hosts=frozenset({source["allowed_domain"]}),
            max_redirects=3,
            max_bytes=5 * 1024 * 1024,
            max_retries=2,
            backoff_seconds=0.25,
        )
        fetcher = SafeFetcher(policy)
        try:
            fetched = fetcher.fetch(source["canonical_url"])
            result: dict[str, object] = {
                "source_id": source_id,
                "url": fetched.url,
                "status": fetched.status,
                "status_code": fetched.status_code,
                "attempts": fetched.attempts,
                "captured_at": datetime.now(timezone.utc).isoformat(),
            }
            if fetched.body is not None and fetched.status in {"ok", "not_modified"}:
                content_hash = sha256(fetched.body).hexdigest()
                snapshot_path = root / f"{content_hash}.html"
                if not snapshot_path.exists():
                    snapshot_path.write_bytes(fetched.body)
                result.update(
                    {
                        "content_hash": content_hash,
                        "bytes": len(fetched.body),
                        "snapshot_path": str(snapshot_path),
                    }
                )
            if fetched.error:
                result["error"] = fetched.error
            results.append(result)
        finally:
            fetcher.close()
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
