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
from urllib.parse import urlsplit

from collector.capture_report import write_capture_report
from collector.http_policy import SafeFetcher, SourcePolicy
from collector.it_passport import IT_PASSPORT_SOURCES


CAPTURE_ROOT = Path("var/official-snapshots/it-passport")
REPORT_PATH = CAPTURE_ROOT / "capture-report.json"


def selected_capture_sources(
    source_ids: tuple[str, ...] | None,
) -> dict[str, dict[str, str]]:
    # source_ids=None keeps the routine whole-table run; scoped authorizations pass ids.
    return (
        dict(IT_PASSPORT_SOURCES)
        if source_ids is None
        else {source_id: IT_PASSPORT_SOURCES[source_id] for source_id in source_ids}
    )


def capture_registered_sources(
    output_root: str | Path = CAPTURE_ROOT,
    *,
    source_ids: tuple[str, ...] | None = None,
) -> dict[str, object]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("live capture refuses NODE_ENV=production")
    if os.getenv("IT_PASSPORT_LIVE_AUTHORIZED") != "1":
        raise RuntimeError(
            "set IT_PASSPORT_LIVE_AUTHORIZED=1 after completing the authorization checklist"
        )
    unknown = set(source_ids or ()) - set(IT_PASSPORT_SOURCES)
    if unknown:
        raise ValueError(f"unregistered IT Passport source: {sorted(unknown)!r}")
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    for source_id, source in selected_capture_sources(source_ids).items():
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
                # The registered 試験要綱 is a PDF; keep its suffix so the
                # analysis/ingest path can dispatch to the PDF extractor.
                path_lower = urlsplit(source["canonical_url"]).path.lower()
                suffix = ".pdf" if path_lower.endswith(".pdf") else ".html"
                snapshot_path = root / f"{content_hash}{suffix}"
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
    return write_capture_report(root, results, datetime.now(timezone.utc).isoformat())


def requested_capture_source_ids() -> tuple[str, ...] | None:
    """Comma-separated ids from the environment, so a scoped authorization reaches the CLI."""
    raw = os.getenv("IT_PASSPORT_CAPTURE_SOURCE_IDS", "")
    return tuple(item.strip() for item in raw.split(",") if item.strip()) or None


if __name__ == "__main__":
    print(
        json.dumps(
            capture_registered_sources(source_ids=requested_capture_source_ids()),
            ensure_ascii=False,
            indent=2,
        )
    )
