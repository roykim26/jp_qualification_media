from pathlib import Path

from collector.capture_fundamental_it import capture_registered_sources


def test_live_capture_requires_explicit_authorization(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("FUNDAMENTAL_IT_LIVE_AUTHORIZED", raising=False)
    try:
        capture_registered_sources(tmp_path)
    except RuntimeError as error:
        assert "FUNDAMENTAL_IT_LIVE_AUTHORIZED" in str(error)
    else:
        raise AssertionError("live capture must require authorization")


def test_capture_is_capture_only(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("FUNDAMENTAL_IT_LIVE_AUTHORIZED", "1")
    import collector.capture_fundamental_it as module

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
