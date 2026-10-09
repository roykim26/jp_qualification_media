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
