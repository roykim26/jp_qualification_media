import pytest
from hashlib import sha256
import json

import collector.capture_takken as module
import collector.ingest_takken as ingest_module
from collector.capture_takken import (
    DIRECTLY_CITED_CAPTURE_DOCUMENTS,
    capture_directly_cited_documents,
    DIRECTLY_CITED_CAPTURE_SOURCES,
    capture_directly_cited_sources,
    capture_registered_source,
)
from collector.ingest_takken import capture_record


def test_takken_capture_requires_explicit_authorization(monkeypatch, tmp_path):
    monkeypatch.delenv("TAKKEN_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="TAKKEN_LIVE_AUTHORIZED"):
        capture_registered_source(tmp_path)


def test_takken_capture_uses_immutable_hash_named_snapshot(monkeypatch, tmp_path):
    monkeypatch.setenv("TAKKEN_LIVE_AUTHORIZED", "1")
    import collector.capture_takken as module

    body = b"<html>official mock</html>"

    class FakeFetcher:
        def __init__(self, policy):
            self.policy = policy

        def fetch(self, url):
            return type("Result", (), {"url": url, "status": "ok", "status_code": 200,
                                       "attempts": 1, "body": body, "error": None})()

        def close(self):
            pass

    monkeypatch.setattr(module, "SafeFetcher", FakeFetcher)
    report = capture_registered_source(tmp_path)
    snapshot = tmp_path / f"{sha256(body).hexdigest()}.html"

    assert report["candidate_ingest"] == "not_run"
    assert snapshot.read_bytes() == body


def _seed_offline_report(tmp_path, source_id, report_name, url):
    foreign = {
        "source_id": source_id,
        "status": "ok",
        "status_code": 200,
        "attempts": 1,
        "captured_at": "2026-09-08T02:10:08+00:00",
        "url": url,
        "content_hash": "c" * 64,
        "snapshot_path": str(tmp_path / "legacy.html"),
    }
    (tmp_path / report_name).write_text(
        json.dumps({"results": [foreign], "source_count": 1}), encoding="utf-8"
    )


def _offline_fetcher(body):
    class FakeFetcher:
        def __init__(self, policy, transport=None):
            self.policy = policy

        def fetch(self, url):
            return type("Result", (), {"url": url, "status": "ok", "status_code": 200,
                                       "attempts": 1, "body": body, "error": None})()

        def close(self):
            pass

    return FakeFetcher


def test_registered_capture_keeps_older_records(monkeypatch, tmp_path):
    monkeypatch.setenv("TAKKEN_LIVE_AUTHORIZED", "1")
    _seed_offline_report(
        tmp_path,
        "capture-only:takken:legacy",
        "capture-report.json",
        "https://www.retio.or.jp/exam/legacy/",
    )
    monkeypatch.setattr(
        "collector.capture_takken.SafeFetcher", _offline_fetcher(b"<html>official mock</html>")
    )

    report = capture_registered_source(tmp_path)

    assert report["source_count"] == 1
    assert report["retained_source_count"] == 2
    assert "capture-only:takken:legacy" in {item["source_id"] for item in report["results"]}


def test_directly_cited_partial_run_keeps_the_other_sources(monkeypatch, tmp_path):
    monkeypatch.setenv("TAKKEN_LIVE_AUTHORIZED", "1")
    report_name = module.DIRECTLY_CITED_REPORT
    _seed_offline_report(
        tmp_path,
        "capture-only:takken:past-questions",
        report_name,
        "https://www.retio.or.jp/exam/past_ques_ans/other/",
    )
    monkeypatch.setattr(
        module, "SafeFetcher", _offline_fetcher(b"<html>official mock</html>")
    )

    report = capture_directly_cited_sources(
        tmp_path, ("capture-only:takken:faq", "capture-only:takken:schedule")
    )

    assert report["source_count"] == 2
    assert report["retained_source_count"] == 3
    ids = {item["source_id"] for item in report["results"]}
    assert ids == {
        "capture-only:takken:faq",
        "capture-only:takken:schedule",
        "capture-only:takken:past-questions",
    }


def test_document_capture_keeps_older_records(monkeypatch, tmp_path):
    monkeypatch.setenv("TAKKEN_LIVE_AUTHORIZED", "1")
    _seed_offline_report(
        tmp_path,
        "capture-only:takken:legacy-document",
        module.DIRECTLY_CITED_DOCUMENT_REPORT,
        "https://www.retio.or.jp/exam/legacy.pdf",
    )
    monkeypatch.setattr(module, "SafeFetcher", _offline_fetcher(b"%PDF-official-mock"))

    report = capture_directly_cited_documents(tmp_path)

    assert report["source_count"] == 1
    assert report["retained_source_count"] == 2
    assert (tmp_path / module.DIRECTLY_CITED_DOCUMENT_REPORT).exists()


def test_takken_ingest_requires_reported_raw_hash(monkeypatch, tmp_path):
    snapshot = tmp_path / "snapshot.html"
    snapshot.write_bytes(b"official bytes")
    content_hash = sha256(snapshot.read_bytes()).hexdigest()
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [{"source_id": "source:takken:retio-exam", "content_hash": content_hash,
                                  "status": "ok", "status_code": 200, "captured_at": "2026-09-23T02:19:09+00:00",
                                  "url": "https://www.retio.or.jp/exam/", "snapshot_path": str(snapshot)}]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    assert capture_record(snapshot)["status_code"] == 200
    snapshot.write_bytes(b"tampered bytes")
    with pytest.raises(ValueError, match="raw snapshot hash"):
        capture_record(snapshot)


def test_directly_cited_capture_rejects_unlisted_urls(monkeypatch, tmp_path):
    monkeypatch.setenv("TAKKEN_LIVE_AUTHORIZED", "1")
    assert set(DIRECTLY_CITED_CAPTURE_SOURCES) == {
        "capture-only:takken:exam-detail",
        "capture-only:takken:schedule",
        "capture-only:takken:postal-application",
        "capture-only:takken:faq",
        "capture-only:takken:past-questions",
        "capture-only:takken:registration-course",
    }
    with pytest.raises(ValueError, match="unregistered directly cited"):
        capture_directly_cited_sources(tmp_path, ("capture-only:takken:unknown",))


def test_directly_cited_document_capture_is_authorized_and_hash_named(monkeypatch, tmp_path):
    monkeypatch.setenv("TAKKEN_LIVE_AUTHORIZED", "1")
    import collector.capture_takken as module

    body = b"%PDF-official-mock"

    class FakeFetcher:
        def __init__(self, policy):
            self.policy = policy

        def fetch(self, url):
            return type(
                "Result",
                (),
                {
                    "url": url,
                    "status": "ok",
                    "status_code": 200,
                    "attempts": 1,
                    "body": body,
                    "error": None,
                },
            )()

        def close(self):
            pass

    monkeypatch.setattr(module, "SafeFetcher", FakeFetcher)
    report = capture_directly_cited_documents(tmp_path)
    source_id, (url, suffix) = next(iter(DIRECTLY_CITED_CAPTURE_DOCUMENTS.items()))
    snapshot = tmp_path / f"{sha256(body).hexdigest()}{suffix}"

    assert source_id == "capture-only:takken:2026-internet-application-guide"
    assert report["candidate_ingest"] == "not_run"
    assert report["results"][0]["url"] == url
    assert snapshot.read_bytes() == body
