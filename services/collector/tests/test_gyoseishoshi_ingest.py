import json
from hashlib import sha256
from pathlib import Path

import collector.ingest_gyoseishoshi as ingest_module
from collector.ingest_gyoseishoshi import capture_record, ingest_snapshot


def test_gyoseishoshi_ingest_requires_explicit_local_write(monkeypatch):
    monkeypatch.delenv("GYOSEISHOSHI_LOCAL_WRITE", raising=False)
    path = Path("var/official-snapshots/gyoseishoshi/guide.html")
    try:
        ingest_snapshot("postgresql://localhost/db", "source:gyoseishoshi:guide", path, 2026)
    except RuntimeError as error:
        assert "GYOSEISHOSHI_LOCAL_WRITE" in str(error)
    else:
        raise AssertionError("ingest must require explicit local authorization")


def _write_report(tmp_path: Path, snapshot: Path, content_hash: str) -> None:
    (tmp_path / "capture-report.json").write_text(
        json.dumps(
            {
                "results": [
                    {
                        "source_id": "source:gyoseishoshi:guide",
                        "content_hash": content_hash,
                        "status": "ok",
                        "status_code": 200,
                        "captured_at": "2026-09-08T02:10:08.722939+00:00",
                        "url": "https://www.gyosei-shiken.or.jp/doc/guide/guide.html",
                        "snapshot_path": str(snapshot),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )


def test_gyoseishoshi_capture_record_requires_reported_raw_hash(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "guide.html"
    snapshot.write_bytes(b"official bytes")
    _write_report(tmp_path, snapshot, sha256(b"tampered bytes").hexdigest())
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    try:
        capture_record("source:gyoseishoshi:guide", snapshot)
    except ValueError as error:
        assert "raw snapshot hash" in str(error)
    else:
        raise AssertionError("raw bytes must be verified against the capture report")

    snapshot.write_bytes(b"official bytes")
    _write_report(tmp_path, snapshot, sha256(snapshot.read_bytes()).hexdigest())
    record = capture_record("source:gyoseishoshi:guide", snapshot)
    assert record["status_code"] == 200
    assert record["content_hash"] == sha256(b"official bytes").hexdigest()


def test_gyoseishoshi_capture_record_rejects_path_mismatch(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "guide.html"
    snapshot.write_bytes(b"official bytes")
    _write_report(tmp_path, tmp_path / "other.html", sha256(snapshot.read_bytes()).hexdigest())
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    try:
        capture_record("source:gyoseishoshi:guide", snapshot)
    except ValueError as error:
        assert "path does not match" in str(error)
    else:
        raise AssertionError("ingest path must match the captured snapshot path")


def test_gyoseishoshi_capture_record_rejects_failed_fetch(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "guide.html"
    snapshot.write_bytes(b"official bytes")
    report = {
        "results": [
            {
                "source_id": "source:gyoseishoshi:guide",
                "content_hash": sha256(snapshot.read_bytes()).hexdigest(),
                "status": "error",
                "status_code": 503,
                "captured_at": "2026-09-08T02:10:08.722939+00:00",
                "url": "https://www.gyosei-shiken.or.jp/doc/guide/guide.html",
                "snapshot_path": str(snapshot),
            }
        ]
    }
    (tmp_path / "capture-report.json").write_text(json.dumps(report), encoding="utf-8")
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    try:
        capture_record("source:gyoseishoshi:guide", snapshot)
    except ValueError as error:
        assert "no successful record" in str(error)
    else:
        raise AssertionError("only a successful official fetch may be ingested")
