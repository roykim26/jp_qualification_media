import json
from hashlib import sha256

import pytest

from collector.patrol_record import (
    capture_run_statement,
    group_runs,
    record_patrol_report,
    snapshot_statement,
    source_check_statement,
    validate_changed_snapshots,
)

RUN_ID = "patrol-20261111T000000Z"
CHECKED_AT = "2026-11-11T00:00:00+00:00"
CAPTURE_RUN_ID = f"capture-run:patrol:{RUN_ID}"


def _result(source_id, status, **overrides):
    item = {
        "source_id": source_id,
        "qualification": "fundamental-it-engineer",
        "url": "https://www.ipa.go.jp/shiken/kubun/fe.html",
        "final_url": "https://www.ipa.go.jp/shiken/kubun/fe.html",
        "http_status": 200,
        "attempts": 1,
        "checked_at": CHECKED_AT,
        "run_id": RUN_ID,
        "status": status,
    }
    if status == "changed":
        item["content_hash"] = "a" * 64
        item["snapshot_path"] = "var/official-snapshots/fundamental-it/aaaa.html"
    if status in {"failed", "blocked"}:
        item["error"] = "HTTP 404" if status == "failed" else "final URL path drifted"
        item["http_status"] = 404 if status == "failed" else 200
    item.update(overrides)
    return item


def _report(*results):
    return {"run_id": RUN_ID, "results": list(results)}


def test_record_requires_explicit_local_write(monkeypatch):
    monkeypatch.delenv("PATROL_LOCAL_WRITE", raising=False)
    with pytest.raises(RuntimeError, match="PATROL_LOCAL_WRITE"):
        record_patrol_report("postgresql://localhost/db", "missing.json")


def test_record_refuses_production(monkeypatch):
    monkeypatch.setenv("PATROL_LOCAL_WRITE", "1")
    monkeypatch.setenv("NODE_ENV", "production")
    with pytest.raises(RuntimeError, match="production"):
        record_patrol_report("postgresql://localhost/db", "missing.json")


def test_record_refuses_non_localhost(monkeypatch):
    monkeypatch.setenv("PATROL_LOCAL_WRITE", "1")
    with pytest.raises(RuntimeError, match="localhost"):
        record_patrol_report("postgresql://user@db.example.com/db", "missing.json")


def test_capture_run_status_reflects_mix_of_outcomes():
    def status_of(*statuses):
        items = [_result(f"source:{i}", s) for i, s in enumerate(statuses)]
        return capture_run_statement(RUN_ID, items)[1][3]

    assert status_of("unchanged", "changed") == "succeeded"
    assert status_of("unchanged", "failed") == "partial"
    assert status_of("failed", "blocked") == "failed"


def test_group_runs_separates_run_ids():
    report = _report(
        _result("source:a", "unchanged"),
        _result("source:b", "failed", run_id="patrol-20261112T000000Z"),
    )
    runs = group_runs(report)
    assert set(runs) == {RUN_ID, "patrol-20261112T000000Z"}
    assert [item["source_id"] for item in runs[RUN_ID]] == ["source:a"]
    assert [item["source_id"] for item in runs["patrol-20261112T000000Z"]] == ["source:b"]


def test_snapshot_statement_returns_id_and_converts_jst():
    sql, params = snapshot_statement(_result("source:b", "changed"), CAPTURE_RUN_ID)
    assert "RETURNING id" in sql
    assert params[0] == f"snapshot:patrol:source:b:{'a' * 64}"
    assert params[5] == CAPTURE_RUN_ID
    assert params[9] == "2026-11-11T09:00:00+09:00"


def test_source_check_links_snapshot_only_for_changed():
    changed = _result("source:b", "changed")
    failed = _result("source:c", "failed")
    _, changed_params = source_check_statement(changed, CAPTURE_RUN_ID, "snapshot:real-id")
    _, failed_params = source_check_statement(failed, CAPTURE_RUN_ID, None)
    assert changed_params[0] == f"source-check:patrol:source:b:{RUN_ID}"
    assert changed_params[2] == CAPTURE_RUN_ID
    assert changed_params[3] == "snapshot:real-id"
    assert failed_params[3] is None
    assert failed_params[5] == "failed"


def test_statements_touch_only_operational_tables():
    items = [
        _result("source:a", "unchanged"),
        _result("source:b", "changed"),
        _result("source:c", "failed"),
        _result("source:d", "blocked"),
    ]
    statements = [capture_run_statement(RUN_ID, items)]
    for item in items:
        if item["status"] == "changed":
            statements.append(snapshot_statement(item, CAPTURE_RUN_ID))
        statements.append(source_check_statement(item, CAPTURE_RUN_ID, None))
    targets = {sql.split("INSERT INTO")[1].split()[0] for sql, _params in statements}
    assert targets == {"capture_runs", "snapshots", "source_checks"}
    for sql, _params in statements:
        for forbidden in ("candidate_facts", "fact_revisions", "change_events", "reviews", "INSERT INTO facts"):
            assert forbidden not in sql


def test_validate_changed_snapshots_checks_hash(tmp_path):
    body = b"official bytes"
    path = tmp_path / "snapshot.html"
    path.write_bytes(body)
    good = _result("source:b", "changed", content_hash=sha256(body).hexdigest(), snapshot_path=str(path))
    validate_changed_snapshots(_report(good))
    bad = _result("source:b", "changed", content_hash="b" * 64, snapshot_path=str(path))
    with pytest.raises(ValueError, match="hash does not match"):
        validate_changed_snapshots(_report(bad))


class _FakeCursor:
    rowcount = 1

    def __init__(self, executed, registered):
        self._executed = executed
        self._registered = registered

    def execute(self, sql, params=None):
        self._executed.append((sql, params))

    def fetchall(self):
        return [(source_id,) for source_id in self._registered]

    def fetchone(self):
        return ("snapshot:real-id",)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _FakeConnection:
    def __init__(self, executed, registered):
        self._executed = executed
        self._registered = registered

    def cursor(self):
        return _FakeCursor(self._executed, self._registered)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _patch_connection(monkeypatch, executed, registered):
    monkeypatch.setenv("PATROL_LOCAL_WRITE", "1")
    monkeypatch.setattr(
        "collector.patrol_record.psycopg.connect",
        lambda *a, **k: _FakeConnection(executed, registered),
    )


def test_record_links_real_snapshot_id_and_writes_only_operational_tables(monkeypatch, tmp_path):
    body = b"official bytes"
    path = tmp_path / "snapshot.html"
    path.write_bytes(body)
    report = _report(
        _result("source:b", "changed", content_hash=sha256(body).hexdigest(), snapshot_path=str(path)),
        _result("source:c", "failed"),
    )
    report_path = tmp_path / "patrol-report.json"
    report_path.write_text(json.dumps(report), encoding="utf-8")
    executed = []
    _patch_connection(monkeypatch, executed, ["source:b", "source:c"])

    summary = record_patrol_report("postgresql://localhost/db", report_path)

    assert summary["status"] == "recorded"
    assert summary["candidates"] == 0
    assert summary["approval"] == "not_run"
    assert summary["source_checks"] == 2
    assert summary["snapshots"] == 1
    assert summary["capture_runs"] == 1
    assert summary["skipped_unregistered"] == 0
    assert executed[0][0] == "SELECT id FROM sources"
    changed_check = [
        params
        for sql, params in executed
        if sql.strip().startswith("INSERT INTO source_checks") and params[1] == "source:b"
    ][0]
    assert changed_check[3] == "snapshot:real-id"
    for sql, _params in executed[1:]:
        assert sql.strip().startswith("INSERT INTO")
        target = sql.split("INSERT INTO")[1].split()[0]
        assert target in {"capture_runs", "snapshots", "source_checks"}


def test_record_skips_sources_not_registered_in_database(monkeypatch, tmp_path):
    report = _report(
        _result("source:b", "unchanged"),
        _result("capture-only:fp:kinzai-fp-faq", "failed"),
    )
    report_path = tmp_path / "patrol-report.json"
    report_path.write_text(json.dumps(report), encoding="utf-8")
    executed = []
    _patch_connection(monkeypatch, executed, ["source:b"])

    summary = record_patrol_report("postgresql://localhost/db", report_path)

    assert summary["skipped_unregistered"] == 1
    assert summary["skipped_source_ids"] == ["capture-only:fp:kinzai-fp-faq"]
    assert summary["source_checks"] == 1
    for sql, params in executed[1:]:
        if sql.strip().startswith("INSERT INTO source_checks"):
            assert params[1] == "source:b"