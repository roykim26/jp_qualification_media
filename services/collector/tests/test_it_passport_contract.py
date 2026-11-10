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
        "source:it-passport:ipa-fee",
        "source:it-passport:ipa-exam-detail",
        "source:it-passport:jitec-faq",
    }
    assert all(item["canonical_url"].startswith("https://") for item in plan)


def test_it_passport_source_boundary_rejects_unregistered_hosts():
    assert is_registered_source_url("https://www3.jitec.ipa.go.jp/JitesCbt/")
    assert is_registered_source_url("https://www.ipa.go.jp/shiken/")
    assert is_registered_source_url(
        "https://www.ipa.go.jp/shiken/mousikomi/schedule.html"
    )
    assert is_registered_source_url("https://www.ipa.go.jp/shiken/kubun/ip.html")
    assert is_registered_source_url(
        "https://www3.jitec.ipa.go.jp/JitesCbt/html/reference/faq.html"
    )
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


def test_real_parser_treats_jitec_home_news_as_entry_page_only():
    snapshot = snapshot_from_html(
        "source:it-passport:jitec-home",
        """<html><head><title>【ITパスポート試験】情報処理推進機構</title></head><body>
        <table><tr><td>2026年11月5日</td><td>
        CBT方式で実施するITパスポート試験、情報セキュリティマネジメント試験及び
        基本情報技術者試験における2027年1月以降の実施予定について
        </td></tr></table>
        </body></html>""",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert candidates == []
    assert issues == ()


def test_fee_page_extracts_category_fee_as_high_risk_integer():
    snapshot = snapshot_from_html(
        "source:it-passport:ipa-fee",
        """<html><head><title>スケジュール、手数料など | 試験情報 | IPA</title></head><body>
        <p>合格発表日、合格証書発送日などはこちらをご覧ください。</p>
        <p>受験手数料 7,500円（情報処理技術者試験は消費税込み。情報処理安全確保支援士試験は非課税。）です。</p>
        </body></html>""",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert not issues
    assert [
        (item.fact_key, item.normalized_value, item.value_type) for item in candidates
    ] == [("fee", "7500", "integer")]
    assert candidates[0].risk_level == "high"
    assert candidates[0].status == "pending_review"
    assert "受験手数料" in candidates[0].evidence_text


def test_exam_detail_page_reads_only_labelled_method_and_structure():
    snapshot = snapshot_from_html(
        "source:it-passport:ipa-exam-detail",
        """<html><head><title>ITパスポート試験 | 試験情報 | IPA</title></head><body>
        <p>実施方式・実施時期 CBT方式により随時実施</p>
        <p>4．試験時間・出題形式・出題数 試験時間 120分 出題形式 多肢選択式（四肢択一） 出題数 100問（小問形式）</p>
        </body></html>""",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert not issues
    by_key = {item.fact_key: item for item in candidates}
    assert by_key["exam_method"].normalized_value == "CBT"
    assert by_key["exam_time"].normalized_value == "120"
    assert by_key["exam_time"].value_type == "integer"
    assert by_key["question_format"].normalized_value == "多肢選択式（四肢択一）"
    assert by_key["question_count"].normalized_value == "100"
    assert by_key["question_count"].value_type == "integer"
    assert all(item.risk_level == "medium" for item in candidates)


def test_faq_page_reads_eligibility_subjects_and_pass_criteria():
    snapshot = snapshot_from_html(
        "source:it-passport:jitec-faq",
        """<html><head><title>【ITパスポート試験】FAQ</title></head><body>
        <p>Ａ ： 受験資格は特段ありません。 この試験の狙いは、すべての社会人が備えておくべき情報技術の基礎知識を受験者に習得していただくことにあります。</p>
        <p>Ａ ： 120分の試験で100問の問題が出題されます。 すべて多肢選択式(四肢択一)の問題で、ストラテジ系（経営全般）、マネジメント系（IT管理）、テクノロジ系（IT技術）の3つの分野から幅広く出題されます。</p>
        <p>Ａ ： 合格基準を満たすには、総合評価点が600点以上であるとともに、すべての分野別評価点が300点以上である必要があります。</p>
        </body></html>""",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert not issues
    by_key = {item.fact_key: item for item in candidates}
    assert by_key["eligibility"].normalized_value == "受験資格は特段ありません"
    assert (
        by_key["exam_subjects"].normalized_value
        == "ストラテジ系、マネジメント系、テクノロジ系"
    )
    assert (
        by_key["passing_standard"].normalized_value
        == "総合評価点600点以上かつ全分野別評価点300点以上"
    )
    assert by_key["eligibility"].risk_level == "high"
    assert by_key["passing_standard"].risk_level == "high"
    assert by_key["exam_subjects"].risk_level == "medium"
    assert all(item.synthetic is False for item in candidates)


def test_faq_page_structure_change_yields_no_candidates():
    snapshot = snapshot_from_html(
        "source:it-passport:jitec-faq",
        "<html><head><title>お知らせ</title></head><body><p>FAQ を更新しました。</p></body></html>",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_fee_page_without_explicit_amount_yields_no_candidate():
    snapshot = snapshot_from_html(
        "source:it-passport:ipa-fee",
        "<html><head><title>スケジュール、手数料など | IPA</title></head><body><p>手数料は改定されました。</p></body></html>",
        synthetic=False,
    )
    candidates, issues = extract_real_page_candidates(snapshot)
    assert candidates == []
    assert [issue.code for issue in issues] == ["target_fields_missing"]
