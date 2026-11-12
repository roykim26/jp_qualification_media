import json
from urllib.parse import urlsplit

from collector.bookkeeping import BOOKKEEPING_SOURCES
from collector.capture_fp import DIRECTLY_CITED_CAPTURE_SOURCES as FP_CAPTURE_ONLY
from collector.capture_takken import (
    DIRECTLY_CITED_CAPTURE_DOCUMENTS as TAKKEN_CAPTURE_DOCUMENTS,
)
from collector.capture_takken import (
    DIRECTLY_CITED_CAPTURE_SOURCES as TAKKEN_CAPTURE_ONLY,
)
from collector.fp import FP_SOURCES
from collector.fundamental_it import FUNDAMENTAL_IT_SOURCES
from collector.gyoseishoshi import GYoseishoshi_SOURCES
from collector.it_passport import IT_PASSPORT_SOURCES
from collector.source_registry import build_registry, registry_json
from collector.takken import TAKKEN_SOURCE


def test_registry_covers_every_registered_url_source():
    expected = (
        set(FUNDAMENTAL_IT_SOURCES)
        | set(IT_PASSPORT_SOURCES)
        | set(GYoseishoshi_SOURCES)
        | set(FP_SOURCES)
        | set(FP_CAPTURE_ONLY)
        | set(BOOKKEEPING_SOURCES)
        | {TAKKEN_SOURCE["id"]}
        | set(TAKKEN_CAPTURE_ONLY)
        | set(TAKKEN_CAPTURE_DOCUMENTS)
    )
    assert set(build_registry()) == expected


def test_registry_urls_are_https_and_domains_match():
    for source in build_registry().values():
        parsed = urlsplit(source.canonical_url)
        assert parsed.scheme == "https"
        assert source.allowed_domain == parsed.hostname


def test_registry_marks_pdf_sources_and_capture_only_evidence():
    registry = build_registry()
    assert registry["capture-only:fp:jafp-2-3-application-outline-pdf"].kind == "pdf"
    assert registry["capture-only:fp:jafp-2-3-application-outline-pdf"].capture_only is True
    assert registry["capture-only:takken:2026-internet-application-guide"].kind == "pdf"
    assert registry["source:fundamental-it:exam"].kind == "html"
    assert registry["source:fundamental-it:exam"].capture_only is False
    assert registry["source:fundamental-it:exam"].snapshot_dir == "fundamental-it"
    assert registry["source:fundamental-it:statistics-fe-suiihyo"].kind == "xlsx"
    assert registry["source:fundamental-it:youkou-pdf"].kind == "pdf"


def test_registry_is_stable_and_json_serializable():
    assert build_registry() == build_registry()
    payload = registry_json()
    assert json.loads(json.dumps(payload, ensure_ascii=False)) == payload