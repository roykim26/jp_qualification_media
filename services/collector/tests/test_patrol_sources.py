import json
from hashlib import sha256
from pathlib import Path

import pytest

import collector.patrol_sources as module
from collector.http_policy import CacheEntry, FetchPolicyError, FetchResult
from collector.patrol_sources import merge_patrol_results, patrol_registered_sources

FE_SOURCE = "source:fundamental-it:exam"
FE_URL = "https://www.ipa.go.jp/shiken/kubun/fe.html"
PDF_SOURCE = "capture-only:fp:jafp-2-3-application-outline-pdf"


def _scripted(results_by_source):
    class _ScriptedFetcher:
        def __init__(self, policy, transport=None):
            self.policy = policy
            self.cache = {}

        def fetch(self, url):
            script = results_by_source[self.policy.source_id]
            return script(self, url) if callable(script) else script

        def close(self):
            pass

    return _ScriptedFetcher


def _ok(url, body, etag=None):
    return FetchResult("ok", url, 200, body, CacheEntry(url, body, etag, None), 1, None)


def _run(monkeypatch, tmp_path, results_by_source, source_ids=(FE_SOURCE,)):
    monkeypatch.setenv("PATROL_LIVE_AUTHORIZED", "1")
    monkeypatch.setattr(module, "SafeFetcher", _scripted(results_by_source))
    return patrol_registered_sources(
        tmp_path / "patrol",
        snapshot_root=tmp_path / "snapshots",
        source_ids=source_ids,
        interval_seconds=0,
    )


def test_patrol_requires_explicit_authorization(monkeypatch, tmp_path):
    monkeypatch.delenv("PATROL_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="PATROL_LIVE_AUTHORIZED"):
        patrol_registered_sources(tmp_path)


def test_patrol_refuses_production(monkeypatch, tmp_path):
    monkeypatch.setenv("PATROL_LIVE_AUTHORIZED", "1")
    monkeypatch.setenv("NODE_ENV", "production")
    with pytest.raises(RuntimeError, match="production"):
        patrol_registered_sources(tmp_path)


def test_unregistered_source_is_refused_before_any_request(monkeypatch, tmp_path):
    monkeypatch.setenv("PATROL_LIVE_AUTHORIZED", "1")

    class _NeverFetch:
        def __init__(self, *args, **kwargs):
            raise AssertionError("must not build a fetcher for an unregistered source")

    monkeypatch.setattr(module, "SafeFetcher", _NeverFetch)
    with pytest.raises(ValueError, match="unregistered patrol source"):
        patrol_registered_sources(tmp_path, source_ids=("source:unknown:page",))


def test_first_run_is_changed_and_writes_snapshot(monkeypatch, tmp_path):
    body = b"<html>fe official</html>"
    report = _run(monkeypatch, tmp_path, {FE_SOURCE: _ok(FE_URL, body)})
    result = report["results"][0]
    assert result["status"] == "changed"
    assert result["content_hash"] == sha256(body).hexdigest()
    assert report["candidate_ingest"] == "not_run"
    assert report["database_write"] == "not_run"
    snapshot = tmp_path / "snapshots" / "fundamental-it" / f"{sha256(body).hexdigest()}.html"
    assert snapshot.read_bytes() == body
    cache = json.loads((tmp_path / "patrol" / "cache.json").read_text(encoding="utf-8"))
    assert cache[FE_SOURCE]["content_hash"] == sha256(body).hexdigest()
    assert (tmp_path / "patrol" / "registry.json").exists()


def test_second_run_with_same_bytes_is_unchanged(monkeypatch, tmp_path):
    body = b"<html>stable</html>"
    _run(monkeypatch, tmp_path, {FE_SOURCE: _ok(FE_URL, body)})
    report = _run(monkeypatch, tmp_path, {FE_SOURCE: _ok(FE_URL, body)})
    assert report["results"][0]["status"] == "unchanged"
    assert len(list((tmp_path / "snapshots" / "fundamental-it").glob("*.html"))) == 1


def test_new_bytes_are_changed_and_keep_both_snapshots(monkeypatch, tmp_path):
    _run(monkeypatch, tmp_path, {FE_SOURCE: _ok(FE_URL, b"<html>v1</html>")})
    report = _run(monkeypatch, tmp_path, {FE_SOURCE: _ok(FE_URL, b"<html>v2</html>")})
    assert report["results"][0]["status"] == "changed"
    assert len(list((tmp_path / "snapshots" / "fundamental-it").glob("*.html"))) == 2


def test_304_reuses_disk_snapshot_without_downloading(monkeypatch, tmp_path):
    body = b"<html>cached</html>"
    _run(monkeypatch, tmp_path, {FE_SOURCE: _ok(FE_URL, body, etag='"v1"')})

    def not_modified(fetcher, url):
        entry = fetcher.cache[url]
        assert entry.etag == '"v1"'
        assert entry.body == body
        return FetchResult("not_modified", url, 304, entry.body, entry, 1, None)

    report = _run(monkeypatch, tmp_path, {FE_SOURCE: not_modified})
    result = report["results"][0]
    assert result["status"] == "unchanged"
    assert result["content_hash"] == sha256(body).hexdigest()


def test_404_is_failed_without_retry(monkeypatch, tmp_path):
    result = _run(
        monkeypatch,
        tmp_path,
        {FE_SOURCE: FetchResult("not_found", FE_URL, 404, None, None, 1, "source returned 404")},
    )["results"][0]
    assert result["status"] == "failed"
    assert result["http_status"] == 404
    assert result["attempts"] == 1


def test_410_is_failed(monkeypatch, tmp_path):
    result = _run(
        monkeypatch,
        tmp_path,
        {FE_SOURCE: FetchResult("error", FE_URL, 410, None, None, 3, "HTTP 410")},
    )["results"][0]
    assert result["status"] == "failed"
    assert result["http_status"] == 410


def test_path_drift_is_blocked_and_writes_no_snapshot(monkeypatch, tmp_path):
    drifted = "https://www.ipa.go.jp/shiken/index.html"
    result = _run(
        monkeypatch, tmp_path, {FE_SOURCE: _ok(drifted, b"<html>home</html>")}
    )["results"][0]
    assert result["status"] == "blocked"
    assert "drifted" in result["error"]
    assert not (tmp_path / "snapshots" / "fundamental-it").exists()


def test_policy_error_is_recorded_and_run_continues(monkeypatch, tmp_path):
    def refuse(fetcher, url):
        raise FetchPolicyError("host is not allowlisted: evil.example")

    report = _run(
        monkeypatch,
        tmp_path,
        {FE_SOURCE: refuse, PDF_SOURCE: _ok("https://www.jafp.or.jp/exam/app/howto/files/outline.pdf", b"%PDF-1.4 test")},
        source_ids=(FE_SOURCE, PDF_SOURCE),
    )
    by_id = {item["source_id"]: item for item in report["results"]}
    assert by_id[FE_SOURCE]["status"] == "failed"
    assert "allowlisted" in by_id[FE_SOURCE]["error"]
    assert by_id[PDF_SOURCE]["status"] == "changed"
    pdf_dir = tmp_path / "snapshots" / "fp"
    assert len(list(pdf_dir.glob("*.pdf"))) == 1


def test_failure_keeps_previous_evidence_in_merged_report(monkeypatch, tmp_path):
    body = b"<html>last good</html>"
    _run(monkeypatch, tmp_path, {FE_SOURCE: _ok(FE_URL, body)})
    report = _run(
        monkeypatch,
        tmp_path,
        {FE_SOURCE: FetchResult("not_found", FE_URL, 404, None, None, 1, "source returned 404")},
    )
    result = report["results"][0]
    assert result["status"] == "failed"
    assert result["content_hash"] == sha256(body).hexdigest()


def test_merge_patrol_results_carries_evidence_fields():
    previous = [{"source_id": "s", "status": "changed", "content_hash": "a" * 64, "snapshot_path": "x.html", "bytes": 3}]
    current = [{"source_id": "s", "status": "failed", "error": "HTTP 503"}]
    merged = merge_patrol_results(previous, current)
    assert merged[0]["status"] == "failed"
    assert merged[0]["content_hash"] == "a" * 64
    assert merged[0]["snapshot_path"] == "x.html"


def test_source_ids_come_from_the_environment(monkeypatch):
    monkeypatch.delenv("PATROL_SOURCE_IDS", raising=False)
    assert module.requested_source_ids() is None
    monkeypatch.setenv("PATROL_SOURCE_IDS", f"{FE_SOURCE}, {PDF_SOURCE}")
    assert module.requested_source_ids() == (FE_SOURCE, PDF_SOURCE)