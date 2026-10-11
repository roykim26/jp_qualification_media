import json
from hashlib import sha256
from pathlib import Path

import collector.ingest_fp as ingest_module
from collector.fp import FP_SOURCES
from collector.ingest_fp import INGEST_SOURCES, capture_record, ingest_snapshot

SOURCE_ID = "source:fp:jafp-2-3-outline"
SOURCE_URL = "https://www.jafp.or.jp/exam/outline/"

# Pages the FP adapter cannot read any contracted field out of (2026-10-11 只读
# 预演：磁盘快照逐条解析，这七个全部报 structure_changed)。They stay out of
# INGEST_SOURCES on purpose — ingest_snapshot() aborts on any parse issue.
UNPARSED_FP_SOURCES = (
    "source:fp:jafp-home",
    "source:fp:jafp-1-outline",
    "source:fp:jafp-2-3-application",
    "source:fp:kinzai-home",
    "source:fp:kinzai-2",
    "source:fp:kinzai-3",
    "source:fp:kinzai-schedule",
)


def _write_report(tmp_path: Path, snapshot: Path, content_hash: str, **overrides) -> None:
    record = {
        "source_id": SOURCE_ID,
        "provider_id": "jafp",
        "status": "ok",
        "status_code": 200,
        "attempts": 1,
        "captured_at": "2026-09-11T00:53:44.006941+00:00",
        "url": SOURCE_URL,
        "content_hash": content_hash,
        "snapshot_path": str(snapshot),
    }
    record.update(overrides)
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [record]}), encoding="utf-8"
    )


def test_fp_ingest_requires_explicit_local_write(monkeypatch):
    monkeypatch.delenv("FP_LOCAL_WRITE", raising=False)
    path = Path("var/official-snapshots/fp/jafp-2-3-outline.html")
    try:
        ingest_snapshot("postgresql://localhost/db", SOURCE_ID, path, 2026)
    except RuntimeError as error:
        assert "FP_LOCAL_WRITE" in str(error)
    else:
        raise AssertionError("ingest must require explicit local authorization")


def test_fp_capture_record_rejects_snapshot_without_report(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "jafp-2-3-outline.html"
    snapshot.write_bytes(b"official bytes")
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [], "source_count": 0}), encoding="utf-8"
    )
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    try:
        capture_record(SOURCE_ID, snapshot)
    except ValueError as error:
        assert "no successful record" in str(error)
    else:
        raise AssertionError("a snapshot with no capture report must be refused")


def test_fp_capture_record_requires_reported_raw_hash(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "jafp-2-3-outline.html"
    snapshot.write_bytes(b"official bytes")
    _write_report(tmp_path, snapshot, sha256(b"tampered bytes").hexdigest())
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    try:
        capture_record(SOURCE_ID, snapshot)
    except ValueError as error:
        assert "raw snapshot hash" in str(error)
    else:
        raise AssertionError("raw bytes must be verified against the capture report")

    snapshot.write_bytes(b"official bytes")
    _write_report(tmp_path, snapshot, sha256(b"official bytes").hexdigest())
    record = capture_record(SOURCE_ID, snapshot)
    assert record["status_code"] == 200
    assert record["content_hash"] == sha256(b"official bytes").hexdigest()


def test_fp_capture_record_rejects_path_mismatch(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "jafp-2-3-outline.html"
    snapshot.write_bytes(b"official bytes")
    _write_report(tmp_path, tmp_path / "other.html", sha256(snapshot.read_bytes()).hexdigest())
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    try:
        capture_record(SOURCE_ID, snapshot)
    except ValueError as error:
        assert "path does not match" in str(error)
    else:
        raise AssertionError("ingest path must match the captured snapshot path")


def test_fp_capture_record_rejects_failed_fetch(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "jafp-2-3-outline.html"
    snapshot.write_bytes(b"official bytes")
    _write_report(
        tmp_path,
        snapshot,
        sha256(snapshot.read_bytes()).hexdigest(),
        status="error",
        status_code=503,
    )
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    try:
        capture_record(SOURCE_ID, snapshot)
    except ValueError as error:
        assert "no successful record" in str(error)
    else:
        raise AssertionError("only a successful official fetch may be ingested")


def test_fp_capture_record_reads_the_merged_report(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "jafp-2-3-outline.html"
    snapshot.write_bytes(b"jafp bytes")
    other = tmp_path / "kinzai-1-academic.html"
    other.write_bytes(b"kinzai bytes")
    records = [
        {
            "source_id": "source:fp:kinzai-1-academic",
            "provider_id": "kinzai",
            "status": "ok",
            "status_code": 200,
            "attempts": 1,
            "captured_at": "2026-09-22T13:23:59.182453+00:00",
            "url": "https://www.kinzai.or.jp/ginou/fp/1kyu/gaku.html",
            "content_hash": sha256(b"kinzai bytes").hexdigest(),
            "snapshot_path": str(other),
        },
        {
            "source_id": SOURCE_ID,
            "provider_id": "jafp",
            "status": "ok",
            "status_code": 200,
            "attempts": 2,
            "captured_at": "2026-09-11T00:53:44.006941+00:00",
            "url": SOURCE_URL,
            "content_hash": sha256(b"jafp bytes").hexdigest(),
            "snapshot_path": str(snapshot),
        },
    ]
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": records, "source_count": len(records)}), encoding="utf-8"
    )
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    record = capture_record(SOURCE_ID, snapshot)
    assert record["attempts"] == 2
    assert record["content_hash"] == sha256(b"jafp bytes").hexdigest()


def test_fp_ingest_mapping_covers_every_source_the_parser_can_read():
    assert set(INGEST_SOURCES.values()) == {
        "source:fp:jafp-2-3-outline",
        "source:fp:jafp-schedule",
        "source:fp:kinzai-1-academic",
        "source:fp:kinzai-1-practical",
        "source:fp:kinzai-eligibility",
        "source:fp:kinzai-schedule-2026",
    }
    for name, source_id in INGEST_SOURCES.items():
        assert source_id in FP_SOURCES
        assert name == f"{source_id.removeprefix('source:fp:')}.html"
    assert set(INGEST_SOURCES.values()).isdisjoint(UNPARSED_FP_SOURCES)


def test_fp_ingest_aborts_when_the_page_has_no_contracted_fields(monkeypatch, tmp_path: Path):
    source_id = "source:fp:kinzai-2"
    snapshot = tmp_path / "kinzai-2.html"
    snapshot.write_bytes(b"<html><body>announcement with no contracted fields</body></html>")
    (tmp_path / "capture-report.json").write_text(
        json.dumps(
            {
                "results": [
                    {
                        "source_id": source_id,
                        "provider_id": "kinzai",
                        "status": "ok",
                        "status_code": 200,
                        "attempts": 1,
                        "captured_at": "2026-10-11T00:00:00+00:00",
                        "url": FP_SOURCES[source_id][0],
                        "content_hash": sha256(snapshot.read_bytes()).hexdigest(),
                        "snapshot_path": str(snapshot),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.setenv("FP_LOCAL_WRITE", "1")

    try:
        ingest_snapshot("postgresql://localhost/db", source_id, snapshot)
    except ValueError as error:
        assert "snapshot parse failed" in str(error)
        assert "structure_changed" in str(error)
    else:
        raise AssertionError("a page the adapter cannot read must stop before any write")
