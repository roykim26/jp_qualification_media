import json
from pathlib import Path

from collector.capture_report import merge_capture_report, write_capture_report


def _record(source_id: str, content_hash: str, captured_at: str) -> dict[str, object]:
    name = source_id.rsplit(":", 1)[-1]
    return {
        "source_id": source_id,
        "status": "ok",
        "status_code": 200,
        "attempts": 1,
        "captured_at": captured_at,
        "url": f"https://example.jp/{name}/",
        "content_hash": content_hash,
        "snapshot_path": f"var/official-snapshots/{name}.html",
    }


def test_merge_keeps_records_of_sources_absent_from_this_run():
    stored = _record("source:fp:kinzai-home", "a" * 64, "2026-09-08T10:10:00+00:00")
    added = _record("source:fp:jafp-2-3-outline", "b" * 64, "2026-10-10T01:00:00+00:00")

    results = merge_capture_report([stored], [added])

    assert [item["source_id"] for item in results] == [
        "source:fp:kinzai-home",
        "source:fp:jafp-2-3-outline",
    ]


def test_merge_replaces_a_source_with_the_newest_stored_capture():
    older = _record("source:bookkeeping:calendar", "a" * 64, "2026-09-08T10:10:00+00:00")
    refreshed = _record("source:bookkeeping:calendar", "b" * 64, "2026-10-10T01:00:00+00:00")

    results = merge_capture_report([older], [refreshed])

    assert len(results) == 1
    assert results[0]["content_hash"] == "b" * 64


def test_failed_fetch_keeps_the_previous_stored_record():
    stored = _record("source:it-passport:exam-info", "c" * 64, "2026-09-11T00:53:44+00:00")
    failed = {
        "source_id": "source:it-passport:exam-info",
        "status": "error",
        "status_code": 503,
        "captured_at": "2026-10-10T02:00:00+00:00",
    }

    results = merge_capture_report([stored], [failed])

    assert results == [stored]


def test_failed_fetch_is_still_recorded_when_nothing_was_stored_before():
    failed = {"source_id": "source:gyoseishoshi:guide", "status": "error", "status_code": 503}

    results = merge_capture_report([], [failed])

    assert results == [failed]


def test_write_capture_report_counts_this_run_and_retained_sources(tmp_path: Path):
    previous = _record("source:fp:kinzai-home", "a" * 64, "2026-09-08T10:10:00+00:00")
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [previous], "source_count": 1}), encoding="utf-8"
    )
    added = _record("source:fp:jafp-2-3-outline", "b" * 64, "2026-10-10T01:00:00+00:00")

    report = write_capture_report(tmp_path, [added], "2026-10-10T01:00:02+00:00")

    assert report["captured_at"] == "2026-10-10T01:00:02+00:00"
    assert report["source_count"] == 1
    assert report["retained_source_count"] == 2
    assert report["candidate_ingest"] == "not_run"
    on_disk = json.loads((tmp_path / "capture-report.json").read_text(encoding="utf-8"))
    assert on_disk == report
