import json

import pytest

import collector.capture_bookkeeping as module
from collector.capture_bookkeeping import capture_registered_sources


def test_bookkeeping_capture_requires_explicit_authorization(monkeypatch, tmp_path):
    monkeypatch.delenv("BOOKKEEPING_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="BOOKKEEPING_LIVE_AUTHORIZED"):
        capture_registered_sources(tmp_path)


class _FakeFetcher:
    def __init__(self, policy, transport=None):
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
                "body": b"<html>offline mock</html>",
                "error": None,
            },
        )()

    def close(self):
        pass


def test_capture_run_keeps_records_of_sources_outside_this_run(monkeypatch, tmp_path):
    monkeypatch.setenv("BOOKKEEPING_LIVE_AUTHORIZED", "1")
    foreign = {
        "source_id": "capture-only:bookkeeping:legacy",
        "status": "ok",
        "status_code": 200,
        "captured_at": "2026-09-08T10:10:00+00:00",
        "url": "https://www.kentei.ne.jp/legacy",
        "content_hash": "a" * 64,
        "snapshot_path": str(tmp_path / "legacy.html"),
    }
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [foreign], "source_count": 1}), encoding="utf-8"
    )
    monkeypatch.setattr(module, "SafeFetcher", _FakeFetcher)

    report = capture_registered_sources(tmp_path)

    assert report["source_count"] == len(module.BOOKKEEPING_SOURCES)
    assert report["retained_source_count"] == len(module.BOOKKEEPING_SOURCES) + 1
    assert "capture-only:bookkeeping:legacy" in {
        item["source_id"] for item in report["results"]
    }
    assert (tmp_path / "capture-report.json").exists()


def test_source_ids_narrows_the_run_to_the_authorized_pages(monkeypatch, tmp_path):
    monkeypatch.setenv("BOOKKEEPING_LIVE_AUTHORIZED", "1")
    monkeypatch.setattr(module, "SafeFetcher", _FakeFetcher)
    requested = ("source:bookkeeping:candidate-data",)

    report = capture_registered_sources(tmp_path, source_ids=requested)

    assert [item["source_id"] for item in report["results"]] == list(requested)
    assert report["source_count"] == 1


def test_unregistered_source_id_is_refused_before_any_request(monkeypatch, tmp_path):
    monkeypatch.setenv("BOOKKEEPING_LIVE_AUTHORIZED", "1")

    class _NeverFetch:
        def __init__(self, *args, **kwargs):
            raise AssertionError("must not build a fetcher for an unauthorized source id")

    monkeypatch.setattr(module, "SafeFetcher", _NeverFetch)
    with pytest.raises(ValueError, match="unregistered bookkeeping source"):
        capture_registered_sources(tmp_path, source_ids=("source:bookkeeping:unknown",))


def test_command_line_scope_comes_from_the_environment(monkeypatch):
    monkeypatch.delenv("BOOKKEEPING_CAPTURE_SOURCE_IDS", raising=False)
    assert module.requested_capture_source_ids() is None

    monkeypatch.setenv(
        "BOOKKEEPING_CAPTURE_SOURCE_IDS", "source:bookkeeping:candidate-data, source:bookkeeping:home"
    )
    assert module.requested_capture_source_ids() == (
        "source:bookkeeping:candidate-data",
        "source:bookkeeping:home",
    )
