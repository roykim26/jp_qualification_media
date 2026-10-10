"""Shared capture-report persistence for the controlled live capture scripts.

Each script used to rewrite `capture-report.json` with only the records of the
current run, so a later single-source run erased the provenance that the ingest
chains require (`capture_record()` reads status, code, URL, hash and timestamp
back out of that file).  Records are therefore merged by `source_id`.
"""

from __future__ import annotations

import json
from pathlib import Path

REPORT_NAME = "capture-report.json"


def merge_capture_report(
    previous_results: list[dict[str, object]],
    run_results: list[dict[str, object]],
) -> list[dict[str, object]]:
    retained: dict[str, dict[str, object]] = {}
    for item in previous_results:
        if item.get("source_id"):
            retained[str(item["source_id"])] = item
    for item in run_results:
        key = str(item["source_id"])
        previous_item = retained.get(key)
        # A failed fetch must not erase the evidence of the last stored capture;
        # the retained record still describes the bytes on disk.
        if previous_item is not None and "content_hash" not in item and "content_hash" in previous_item:
            continue
        retained[key] = item
    return list(retained.values())


def write_capture_report(
    root: Path,
    run_results: list[dict[str, object]],
    captured_at: str,
    report_name: str = REPORT_NAME,
) -> dict[str, object]:
    report_path = root / report_name
    previous_results: list[dict[str, object]] = []
    if report_path.exists():
        previous_results = json.loads(report_path.read_text(encoding="utf-8")).get("results", [])
    results = merge_capture_report(previous_results, run_results)
    report = {
        "captured_at": captured_at,
        "source_count": len(run_results),
        "retained_source_count": len(results),
        "results": results,
        "candidate_ingest": "not_run",
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report
