"""Controlled patrol of every registered official source.

Capture-class action: fetches pages through SafeFetcher and writes local
snapshots plus ``var/patrol/patrol-report.json`` only.  It never connects to a
database and never creates candidates.  Recording results into operational
tables is ``collector.patrol_record``, a separately authorized step.

Authorization: ``PATROL_LIVE_AUTHORIZED=1`` after the owner approves the run.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

from collector.http_policy import CacheEntry, FetchPolicyError, SafeFetcher, SourcePolicy
from collector.source_registry import RegisteredSource, build_registry, registry_json

PATROL_ROOT = Path("var/patrol")
SNAPSHOT_ROOT = Path("var/official-snapshots")
REPORT_NAME = "patrol-report.json"
CACHE_NAME = "cache.json"
REGISTRY_NAME = "registry.json"
CONFIG_PATH = Path("config/source-ops.json")
COLLECTOR_VERSION = "collector.patrol_sources/0.1"
DEFAULT_INTERVAL_SECONDS = 1.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _paths_equal(left: str, right: str) -> bool:
    return urlsplit(left).path.rstrip("/") == urlsplit(right).path.rstrip("/")


def load_interval_seconds(config_path: str | Path = CONFIG_PATH) -> float:
    path = Path(config_path)
    if not path.exists():
        return DEFAULT_INTERVAL_SECONDS
    config = json.loads(path.read_text(encoding="utf-8"))
    return float(config.get("patrolIntervalSeconds", DEFAULT_INTERVAL_SECONDS))


def load_cache(path: Path) -> dict[str, dict[str, object]]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def merge_patrol_results(
    previous_results: list[dict[str, object]],
    run_results: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Merge by source_id; a failed check must not erase the last good evidence."""
    retained: dict[str, dict[str, object]] = {}
    for item in previous_results:
        if item.get("source_id"):
            retained[str(item["source_id"])] = item
    for item in run_results:
        key = str(item["source_id"])
        previous_item = retained.get(key)
        if previous_item is not None:
            for field in ("content_hash", "snapshot_path", "bytes"):
                if field not in item and field in previous_item:
                    item[field] = previous_item[field]
        retained[key] = item
    return list(retained.values())


def _cached_snapshot_body(
    source: RegisteredSource,
    entry: dict[str, object],
    snapshot_root: Path,
) -> bytes | None:
    content_hash = entry.get("content_hash")
    if not isinstance(content_hash, str):
        return None
    for suffix in (".pdf", ".html"):
        path = snapshot_root / source.snapshot_dir / f"{content_hash}{suffix}"
        if path.exists():
            return path.read_bytes()
    return None


def _classify(
    source: RegisteredSource,
    fetched: object,
    cache_entry: dict[str, object] | None,
    snapshot_root: Path,
    checked_at: str,
) -> tuple[dict[str, object], dict[str, object] | None]:
    """Return (result, cache_update).  cache_update is None for failed/blocked."""
    result: dict[str, object] = {
        "source_id": source.source_id,
        "qualification": source.qualification,
        "url": source.canonical_url,
        "final_url": fetched.url,
        "http_status": fetched.status_code,
        "attempts": fetched.attempts,
        "checked_at": checked_at,
    }
    if fetched.status == "ok":
        if not _paths_equal(fetched.url, source.canonical_url):
            result["status"] = "blocked"
            result["error"] = f"final URL path drifted from registration: {fetched.url}"
            return result, None
        content_hash = sha256(fetched.body).hexdigest()
        result["content_hash"] = content_hash
        result["bytes"] = len(fetched.body)
        if cache_entry and cache_entry.get("content_hash") == content_hash:
            result["status"] = "unchanged"
        else:
            result["status"] = "changed"
            directory = snapshot_root / source.snapshot_dir
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / f"{content_hash}.{source.kind}"
            if not path.exists():
                path.write_bytes(fetched.body)
            result["snapshot_path"] = str(path)
        entry = fetched.cache_entry
        return result, {
            "etag": entry.etag if entry else None,
            "last_modified": entry.last_modified if entry else None,
            "content_hash": content_hash,
            "final_url": fetched.url,
            "checked_at": checked_at,
        }
    if fetched.status == "not_modified":
        result["status"] = "unchanged"
        if cache_entry and cache_entry.get("content_hash"):
            result["content_hash"] = cache_entry["content_hash"]
        updated = dict(cache_entry or {})
        updated["checked_at"] = checked_at
        return result, updated
    result["status"] = "failed"
    result["error"] = fetched.error or f"HTTP {fetched.status_code}"
    return result, None


def patrol_registered_sources(
    patrol_root: str | Path = PATROL_ROOT,
    *,
    snapshot_root: str | Path = SNAPSHOT_ROOT,
    source_ids: tuple[str, ...] | None = None,
    interval_seconds: float | None = None,
) -> dict[str, object]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("source patrol refuses NODE_ENV=production")
    if os.getenv("PATROL_LIVE_AUTHORIZED") != "1":
        raise RuntimeError("set PATROL_LIVE_AUTHORIZED=1 after the owner approves the patrol run")
    registry = build_registry()
    unknown = set(source_ids or ()) - set(registry)
    if unknown:
        raise ValueError(f"unregistered patrol source: {sorted(unknown)!r}")
    selected = (
        registry
        if source_ids is None
        else {source_id: registry[source_id] for source_id in source_ids}
    )
    root = Path(patrol_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    snapshots = Path(snapshot_root).resolve()
    cache_path = root / CACHE_NAME
    cache = load_cache(cache_path)
    report_path = root / REPORT_NAME
    previous_results: list[dict[str, object]] = []
    if report_path.exists():
        previous_results = json.loads(report_path.read_text(encoding="utf-8")).get("results", [])
    if interval_seconds is None:
        interval_seconds = load_interval_seconds()

    started_at = _now_iso()
    run_id = "patrol-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    results: list[dict[str, object]] = []
    ordered = sorted(selected.values(), key=lambda item: item.source_id)
    for index, source in enumerate(ordered):
        fetcher = SafeFetcher(
            SourcePolicy(
                source_id=source.source_id,
                allowed_hosts=frozenset({source.allowed_domain}),
                max_redirects=3,
                max_bytes=5 * 1024 * 1024,
                max_retries=2,
                backoff_seconds=0.25,
            )
        )
        cache_entry = cache.get(source.source_id)
        if cache_entry and (cache_entry.get("etag") or cache_entry.get("last_modified")):
            body = _cached_snapshot_body(source, cache_entry, snapshots)
            if body is not None:
                fetcher.cache[source.canonical_url] = CacheEntry(
                    source.canonical_url,
                    body,
                    str(cache_entry["etag"]) if cache_entry.get("etag") else None,
                    str(cache_entry["last_modified"]) if cache_entry.get("last_modified") else None,
                )
        checked_at = _now_iso()
        try:
            fetched = fetcher.fetch(source.canonical_url)
        except FetchPolicyError as error:
            results.append(
                {
                    "source_id": source.source_id,
                    "qualification": source.qualification,
                    "url": source.canonical_url,
                    "final_url": source.canonical_url,
                    "http_status": None,
                    "attempts": 0,
                    "checked_at": checked_at,
                    "status": "failed",
                    "error": str(error),
                    "run_id": run_id,
                }
            )
            continue
        finally:
            fetcher.close()
        result, cache_update = _classify(source, fetched, cache_entry, snapshots, checked_at)
        result["run_id"] = run_id
        if cache_update is not None:
            cache[source.source_id] = cache_update
        results.append(result)
        if interval_seconds and index < len(ordered) - 1:
            time.sleep(interval_seconds)

    merged = merge_patrol_results(previous_results, results)
    report = {
        "run_id": run_id,
        "started_at": started_at,
        "finished_at": _now_iso(),
        "source_count": len(results),
        "retained_source_count": len(merged),
        "results": merged,
        "candidate_ingest": "not_run",
        "database_write": "not_run",
        "collector_version": COLLECTOR_VERSION,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / REGISTRY_NAME).write_text(
        json.dumps(registry_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def requested_source_ids() -> tuple[str, ...] | None:
    raw = os.getenv("PATROL_SOURCE_IDS", "")
    return tuple(item.strip() for item in raw.split(",") if item.strip()) or None


if __name__ == "__main__":
    print(
        json.dumps(
            patrol_registered_sources(source_ids=requested_source_ids()),
            ensure_ascii=False,
            indent=2,
        )
    )