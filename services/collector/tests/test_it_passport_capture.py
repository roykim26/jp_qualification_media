from pathlib import Path

import httpx

from collector.capture_it_passport import capture_registered_sources


def test_live_capture_requires_explicit_authorization(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("IT_PASSPORT_LIVE_AUTHORIZED", raising=False)
    try:
        capture_registered_sources(tmp_path)
    except RuntimeError as error:
        assert "IT_PASSPORT_LIVE_AUTHORIZED" in str(error)
    else:
        raise AssertionError("live capture must require explicit authorization")


def test_live_capture_refuses_production(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("IT_PASSPORT_LIVE_AUTHORIZED", "1")
    monkeypatch.setenv("NODE_ENV", "production")
    try:
        capture_registered_sources(tmp_path)
    except RuntimeError as error:
        assert "production" in str(error)
    else:
        raise AssertionError("live capture must refuse production")


def test_capture_report_is_capture_only(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("IT_PASSPORT_LIVE_AUTHORIZED", "1")
    import collector.capture_it_passport as module

    class FakeFetcher:
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

    monkeypatch.setattr(module, "SafeFetcher", FakeFetcher)
    report = capture_registered_sources(tmp_path)
    assert report["source_count"] == 3
    assert report["candidate_ingest"] == "not_run"
    assert len(list(tmp_path.glob("*.html"))) == 1
    assert (tmp_path / "capture-report.json").exists()
