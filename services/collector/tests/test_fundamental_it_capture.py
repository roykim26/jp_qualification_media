import json
from pathlib import Path

import collector.capture_fundamental_it as module
from collector.capture_fundamental_it import capture_registered_sources


def test_live_capture_requires_explicit_authorization(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("FUNDAMENTAL_IT_LIVE_AUTHORIZED", raising=False)
    try:
        capture_registered_sources(tmp_path)
    except RuntimeError as error:
        assert "FUNDAMENTAL_IT_LIVE_AUTHORIZED" in str(error)
    else:
        raise AssertionError("live capture must require authorization")


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


def _seed_foreign_record(tmp_path: Path, source_id: str, report_name: str) -> None:
    foreign = {
        "source_id": source_id,
        "status": "ok",
        "status_code": 200,
        "attempts": 1,
        "captured_at": "2026-09-08T02:10:08+00:00",
        "url": "https://www.jitec.ipa.go.jp/1_04happen_shiki/legacy.html",
        "content_hash": "b" * 64,
        "snapshot_path": str(tmp_path / "legacy.html"),
    }
    (tmp_path / report_name).write_text(
        json.dumps({"results": [foreign], "source_count": 1}), encoding="utf-8"
    )


def test_capture_is_capture_only(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("FUNDAMENTAL_IT_LIVE_AUTHORIZED", "1")
    monkeypatch.setattr(module, "SafeFetcher", _FakeFetcher)
    report = capture_registered_sources(tmp_path)

    assert report["source_count"] == len(module.FUNDAMENTAL_IT_SOURCES)
    assert report["candidate_ingest"] == "not_run"
    assert len(list(tmp_path.glob("*.html"))) == 1
    assert (tmp_path / "capture-report.json").exists()


def test_source_ids_narrows_the_run_to_the_authorized_pages(
    monkeypatch, tmp_path: Path
):
    monkeypatch.setenv("FUNDAMENTAL_IT_LIVE_AUTHORIZED", "1")
    monkeypatch.setattr(module, "SafeFetcher", _FakeFetcher)
    requested = ("source:fundamental-it:statistics-fe",)
    report = capture_registered_sources(tmp_path, source_ids=requested)

    assert [item["source_id"] for item in report["results"]] == list(requested)
    assert report["source_count"] == 1


def test_unregistered_source_id_is_refused_before_any_request(
    monkeypatch, tmp_path: Path
):
    monkeypatch.setenv("FUNDAMENTAL_IT_LIVE_AUTHORIZED", "1")

    class _NeverFetch:
        def __init__(self, *args, **kwargs):
            raise AssertionError("must not build a fetcher for an unauthorized source id")

    monkeypatch.setattr(module, "SafeFetcher", _NeverFetch)
    try:
        capture_registered_sources(tmp_path, source_ids=("source:fundamental-it:unknown",))
    except ValueError as error:
        assert "unregistered Fundamental IT source" in str(error)
    else:
        raise AssertionError("unregistered source ids must be refused")


def test_command_line_scope_comes_from_the_environment(monkeypatch):
    monkeypatch.delenv("FUNDAMENTAL_IT_CAPTURE_SOURCE_IDS", raising=False)
    assert module.requested_capture_source_ids() is None

    monkeypatch.setenv(
        "FUNDAMENTAL_IT_CAPTURE_SOURCE_IDS", "source:fundamental-it:statistics-fe"
    )
    assert module.requested_capture_source_ids() == ("source:fundamental-it:statistics-fe",)


def test_capture_run_keeps_records_of_sources_outside_this_run(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("FUNDAMENTAL_IT_LIVE_AUTHORIZED", "1")
    _seed_foreign_record(tmp_path, "capture-only:fundamental-it:legacy", "capture-report.json")
    monkeypatch.setattr(module, "SafeFetcher", _FakeFetcher)

    report = capture_registered_sources(tmp_path)

    assert report["source_count"] == len(module.FUNDAMENTAL_IT_SOURCES)
    assert report["retained_source_count"] == len(module.FUNDAMENTAL_IT_SOURCES) + 1
    assert "capture-only:fundamental-it:legacy" in {
        item["source_id"] for item in report["results"]
    }
