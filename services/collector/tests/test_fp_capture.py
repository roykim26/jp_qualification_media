from urllib.parse import urlsplit

import pytest

from collector.capture_fp import (
    DIRECTLY_CITED_CAPTURE_SOURCES,
    capture_registered_sources,
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


def test_kinzai_faq_capture_only_source_is_retired():
    # D4: the FAQ page was abolished (301 back to the exam top page), so it is no
    # longer a capture-only source.  The old official snapshot is kept as evidence.
    assert "capture-only:fp:kinzai-fp-faq" not in DIRECTLY_CITED_CAPTURE_SOURCES


def test_kinzai_capture_sources_use_the_migrated_products_domain():
    selected = selected_capture_sources(None)
    kinzai_urls = [url for url, provider, _ in selected.values() if provider == "kinzai"]
    assert kinzai_urls
    assert all(urlsplit(url).hostname == "products.kinzai.or.jp" for url in kinzai_urls)
    # The redundant evidence-only schedule index was retired (revised D3).
    assert "source:fp:kinzai-schedule" not in selected


def test_default_capture_plan_excludes_directly_cited_sources():
    selected = selected_capture_sources(None)

    assert set(selected).isdisjoint(DIRECTLY_CITED_CAPTURE_SOURCES)

