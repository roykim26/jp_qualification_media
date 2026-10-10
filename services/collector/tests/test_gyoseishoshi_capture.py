import json

import pytest

import collector.capture_gyoseishoshi as module
from collector.capture_gyoseishoshi import capture_registered_sources


def test_gyoseishoshi_capture_requires_explicit_authorization(monkeypatch, tmp_path):
    monkeypatch.delenv("GYOSEISHOSHI_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="GYOSEISHOSHI_LIVE_AUTHORIZED"):
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
    monkeypatch.setenv("GYOSEISHOSHI_LIVE_AUTHORIZED", "1")
    foreign = {
        "source_id": "capture-only:gyoseishoshi:legacy",
        "status": "ok",
        "status_code": 200,
        "captured_at": "2026-09-08T02:10:08+00:00",
        "url": "https://www.gyosei-shiken.or.jp/legacy.html",
        "content_hash": "a" * 64,
        "snapshot_path": str(tmp_path / "legacy.html"),
    }
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [foreign], "source_count": 1}), encoding="utf-8"
    )
    monkeypatch.setattr(module, "SafeFetcher", _FakeFetcher)

    report = capture_registered_sources(tmp_path)

    assert report["source_count"] == len(module.GYoseishoshi_SOURCES)
    assert report["retained_source_count"] == len(module.GYoseishoshi_SOURCES) + 1
    assert "capture-only:gyoseishoshi:legacy" in {
        item["source_id"] for item in report["results"]
    }
    assert (tmp_path / "capture-report.json").exists()
