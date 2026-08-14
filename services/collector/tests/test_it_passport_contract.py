from pathlib import Path

import httpx

from collector.http_policy import SafeFetcher, SourcePolicy
from collector.ingest_it_passport import ingest_fixture
from collector.it_passport import (
    extract_candidates,
    diff_declared_fields,
    fetch_it_passport_snapshot,
    is_registered_source_url,
    snapshot_from_html,
    source_plan,
    extract_real_page_candidates,
)


FIXTURES = Path(__file__).parents[3] / "fixtures" / "official-snapshots"


def test_it_passport_source_plan_is_explicit_and_https_only():
    plan = source_plan()
    assert {item["id"] for item in plan} == {
        "source:it-passport:ipa-exam",
        "source:it-passport:jitec-home",
        "source:it-passport:jitec-application",
    }
    assert all(item["canonical_url"].startswith("https://") for item in plan)


def test_it_passport_source_boundary_rejects_unregistered_hosts():
    assert is_registered_source_url("https://www3.jitec.ipa.go.jp/JitesCbt/")
    assert is_registered_source_url("https://www.ipa.go.jp/shiken/")
    assert not is_registered_source_url("http://www3.jitec.ipa.go.jp/JitesCbt/")
    assert not is_registered_source_url("https://example.com/JitesCbt/")


def test_cbt_fixture_extracts_declared_fields_without_inventing_dates():
    snapshot = snapshot_from_html(
        "source:it-passport:jitec-home",
        (FIXTURES / "it-passport-cbt.html").read_text(encoding="utf-8"),
    )
    candidates, issues = extract_candidates(snapshot)
    assert not issues
    assert [candidate.fact_key for candidate in candidates] == [
        "exam_method",
        "exam_content",
    ]
    assert all(candidate.risk_level == "medium" for candidate in candidates)


def test_announcement_change_is_field_level_high_risk_review_candidate():
    previous = snapshot_from_html(
        "source:it-passport:jitec-application",
        (FIXTURES / "it-passport-announcement-v1.html").read_text(encoding="utf-8"),
    )
    current = snapshot_from_html(
        "source:it-passport:jitec-application",
        (FIXTURES / "it-passport-announcement-v2.html").read_text(encoding="utf-8"),
    )
    changes, issues = diff_declared_fields(previous, current)
    assert not issues
    assert changes == {"fee": ("7,500円", "8,000円")}
    candidates, _ = extract_candidates(current)
    fee = next(candidate for candidate in candidates if candidate.fact_key == "fee")
    assert fee.risk_level == "high"
    assert fee.status == "pending_review"


def test_structure_failure_does_not_generate_candidates():
    snapshot = snapshot_from_html(
        "source:it-passport:jitec-home", "<main><p>layout changed</p></main>"
    )
    candidates, issues = extract_candidates(snapshot)
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_404_does_not_create_it_passport_snapshot():
    fetcher = SafeFetcher(
        SourcePolicy(
            source_id="source:it-passport:jitec-home",
            allowed_hosts=frozenset({"www3.jitec.ipa.go.jp"}),
            backoff_seconds=0,
        ),
        httpx.MockTransport(lambda request: httpx.Response(404)),
    )
    assert fetch_it_passport_snapshot(fetcher, "source:it-passport:jitec-home") is None
    assert fetcher.cache == {}
    fetcher.close()


def test_fixture_ingest_requires_explicit_local_write_authorization(monkeypatch):
    monkeypatch.delenv("STAGE2_LOCAL_WRITE", raising=False)
    fixture = FIXTURES / "it-passport-cbt.html"
    try:
        ingest_fixture(
            "postgresql://localhost/db",
            "source:it-passport:jitec-home",
            fixture,
            2026,
        )
    except RuntimeError as error:
        assert "STAGE2_LOCAL_WRITE" in str(error)
    else:
        raise AssertionError("fixture ingest must require explicit authorization")


def test_fixture_ingest_requires_explicit_exam_year(monkeypatch):
    monkeypatch.setenv("STAGE2_LOCAL_WRITE", "1")
    fixture = FIXTURES / "it-passport-cbt.html"
    try:
        ingest_fixture(
            "postgresql://localhost/db",
            "source:it-passport:jitec-home",
            fixture,
            0,
        )
    except ValueError as error:
        assert "exam_year" in str(error)
    else:
        raise AssertionError("fixture ingest must require an explicit year")


def test_real_application_parser_emits_evidenced_review_candidates_only():
    snapshot = snapshot_from_html(
        "source:it-passport:jitec-application",
        """<html><head><title>【ITパスポート試験】受験申込み</title></head><body>
        <p>受験申込内容（試験会場、受験日時）の変更は、試験日の3日前まで行うことができます。</p>
        <p>2026年3月24日21:30以降（メンテナンス終了後）から、5月以降の試験を申込むことができます。</p>
        </body></html>""",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert not issues
    assert [candidate.fact_key for candidate in candidates] == [
        "application_change_deadline_rule",
        "application_open_2026_may_sessions",
    ]
    assert all(
        candidate.status == "pending_review"
        and candidate.risk_level == "high"
        and candidate.synthetic is False
        and candidate.evidence_text
        for candidate in candidates
    )


def test_real_parser_does_not_infer_it_passport_facts_from_ipa_cards():
    snapshot = snapshot_from_html(
        "source:it-passport:ipa-exam",
        "<html><head><title>試験情報 | IPA</title></head><body><p>2026年度 CBT方式</p></body></html>",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert candidates == []
    assert issues == ()
