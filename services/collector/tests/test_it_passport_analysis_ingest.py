import json
from hashlib import sha256
from pathlib import Path

import collector.ingest_it_passport_analysis as module
from collector.ingest_it_passport_analysis import capture_record, ingest_analysis


def test_capture_record_requires_reported_raw_hash(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "snapshot.html"
    snapshot.write_bytes(b"official bytes")
    content_hash = sha256(snapshot.read_bytes()).hexdigest()
    (tmp_path / "capture-report.json").write_text(
        json.dumps(
            {
                "results": [
                    {
                        "source_id": "source:it-passport:jitec-application",
                        "content_hash": content_hash,
                        "status": "ok",
                        "status_code": 200,
                        "captured_at": "2026-08-12T05:46:31+00:00",
                        "url": "https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html",
                        "snapshot_path": str(snapshot),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(module, "CAPTURE_ROOT", tmp_path)

    assert capture_record("source:it-passport:jitec-application", content_hash, snapshot)["status_code"] == 200

    snapshot.write_bytes(b"tampered bytes")
    try:
        capture_record("source:it-passport:jitec-application", content_hash, snapshot)
    except ValueError as error:
        assert "raw snapshot hash" in str(error)
    else:
        raise AssertionError("raw snapshot hash must be verified")


def test_real_analysis_ingest_requires_explicit_authorization(monkeypatch):
    monkeypatch.delenv("IT_PASSPORT_REAL_CANDIDATE_WRITE", raising=False)
    try:
        ingest_analysis("postgresql://localhost/db")
    except RuntimeError as error:
        assert "IT_PASSPORT_REAL_CANDIDATE_WRITE" in str(error)
    else:
        raise AssertionError("real candidate ingest must require authorization")


def test_real_analysis_ingest_refuses_nonlocal_database(monkeypatch):
    monkeypatch.setenv("IT_PASSPORT_REAL_CANDIDATE_WRITE", "1")
    try:
        ingest_analysis("postgresql://production.example/db")
    except RuntimeError as error:
        assert "localhost" in str(error)
    else:
        raise AssertionError("real candidate ingest must refuse nonlocal databases")


def test_real_analysis_ingest_preserves_candidate_risk_and_value_type(
    monkeypatch, tmp_path: Path
):
    """Regression: the INSERT once hardcoded risk_level='high' and text type."""
    snapshot_bytes = b"<html>official</html>"
    content_hash = sha256(snapshot_bytes).hexdigest()
    snapshot = tmp_path / f"{content_hash}.html"
    snapshot.write_bytes(snapshot_bytes)
    (tmp_path / "capture-report.json").write_text(
        json.dumps(
            {
                "results": [
                    {
                        "source_id": "source:it-passport:ipa-exam-detail",
                        "content_hash": content_hash,
                        "status": "ok",
                        "status_code": 200,
                        "captured_at": "2026-11-10T00:00:00+00:00",
                        "url": "https://www.ipa.go.jp/shiken/kubun/ip.html",
                        "snapshot_path": str(snapshot),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    analysis_path = tmp_path / "analysis-report.json"
    analysis_path.write_text(
        json.dumps(
            {
                "database_write": "not_run",
                "results": [
                    {
                        "source_id": "source:it-passport:ipa-exam-detail",
                        "content_hash": content_hash,
                        "candidates": [
                            {
                                "fact_key": "exam_time",
                                "normalized_value": "120",
                                "display_value": "試験時間 120分",
                                "evidence_text": "試験時間 120分",
                                "status": "pending_review",
                                "risk_level": "medium",
                                "value_type": "integer",
                                "synthetic": False,
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    calls: list[tuple[str, tuple[object, ...] | None]] = []

    class Cursor:
        rowcount = 0

        def execute(self, sql, params=None):
            calls.append((sql, params))
            self.rowcount = 1 if "INSERT INTO candidate_facts" in sql else 0

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setenv("IT_PASSPORT_REAL_CANDIDATE_WRITE", "1")
    monkeypatch.setattr(module, "CAPTURE_ROOT", tmp_path)
    monkeypatch.setattr(module.psycopg, "connect", lambda *args, **kwargs: Connection())

    result = ingest_analysis(
        "postgresql://localhost/db", analysis_path=analysis_path, exam_year=2026
    )

    assert result["candidates"] == 1
    insert_params = next(
        params for sql, params in calls if "INSERT INTO candidate_facts" in sql
    )
    assert insert_params is not None
    assert insert_params[4] == "integer"
    assert insert_params[8] == "medium"
