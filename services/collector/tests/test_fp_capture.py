import json

import pytest

from collector.capture_fp import (
    DIRECTLY_CITED_CAPTURE_SOURCES,
    capture_registered_sources,
    merge_capture_report,
    selected_capture_sources,
)


def test_fp_capture_requires_explicit_authorization(monkeypatch):
    monkeypatch.delenv("FP_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="FP_LIVE_AUTHORIZED"):
        capture_registered_sources("var/fp-unauthorized-test")


def test_fp_capture_rejects_unknown_selected_source(monkeypatch):
    monkeypatch.setenv("FP_LIVE_AUTHORIZED", "1")
    with pytest.raises(KeyError):
        capture_registered_sources("var/fp-unauthorized-test", source_ids=("source:fp:unknown",))


def test_jafp_outline_pdf_is_capture_only_not_an_ingestion_source():
    source_id = "capture-only:fp:jafp-2-3-application-outline-pdf"
    url, provider, suffix = DIRECTLY_CITED_CAPTURE_SOURCES[source_id]

    assert url == "https://www.jafp.or.jp/exam/app/howto/files/outline.pdf?v=202607010900"
    assert provider == "jafp"
    assert suffix == ".pdf"


def test_kinzai_faq_is_capture_only_not_an_ingestion_source():
    source_id = "capture-only:fp:kinzai-fp-faq"
    url, provider, suffix = DIRECTLY_CITED_CAPTURE_SOURCES[source_id]

    assert url == "https://www.kinzai.or.jp/ginou/fp/faq"
    assert provider == "kinzai"
    assert suffix == ".html"


def test_default_capture_plan_excludes_directly_cited_sources():
    selected = selected_capture_sources(None)

    assert set(selected).isdisjoint(DIRECTLY_CITED_CAPTURE_SOURCES)


def _record(source_id: str, content_hash: str, captured_at: str) -> dict[str, object]:
    name = source_id.removeprefix("source:fp:")
    return {
        "source_id": source_id,
        "provider_id": "jafp" if "jafp" in name else "kinzai",
        "status": "ok",
        "status_code": 200,
        "attempts": 1,
        "captured_at": captured_at,
        "url": f"https://www.jafp.or.jp/{name}/",
        "content_hash": content_hash,
        "snapshot_path": f"var/official-snapshots/fp/{name}.html",
    }


def test_capture_report_merges_runs_by_source_id(tmp_path):
    older = _record("source:fp:kinzai-home", "a" * 64, "2026-09-08T10:10:00+00:00")
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [older], "source_count": 1}), encoding="utf-8"
    )

    refreshed = _record("source:fp:kinzai-home", "b" * 64, "2026-10-10T01:00:00+00:00")
    added = _record("source:fp:jafp-2-3-outline", "c" * 64, "2026-10-10T01:00:01+00:00")
    report = merge_capture_report(tmp_path, [refreshed, added], "2026-10-10T01:00:02+00:00")

    by_id = {item["source_id"]: item for item in report["results"]}
    assert set(by_id) == {"source:fp:kinzai-home", "source:fp:jafp-2-3-outline"}
    assert by_id["source:fp:kinzai-home"]["content_hash"] == "b" * 64
    assert report["run_source_count"] == 2
    assert report["source_count"] == 2


def test_capture_report_keeps_stored_record_when_a_refetch_fails(tmp_path):
    stored = _record("source:fp:jafp-2-3-outline", "d" * 64, "2026-09-11T00:53:44+00:00")
    (tmp_path / "capture-report.json").write_text(
        json.dumps({"results": [stored], "source_count": 1}), encoding="utf-8"
    )

    failed = {
        "source_id": "source:fp:jafp-2-3-outline",
        "status": "error",
        "status_code": 503,
        "captured_at": "2026-10-10T02:00:00+00:00",
    }
    report = merge_capture_report(tmp_path, [failed], "2026-10-10T02:00:01+00:00")

    assert report["run_source_count"] == 1
    assert report["source_count"] == 1
    assert report["results"] == [stored]
