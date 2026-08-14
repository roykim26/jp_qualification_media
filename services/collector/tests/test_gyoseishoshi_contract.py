from collector.gyoseishoshi import (
    extract_candidates,
    is_registered_source_url,
    snapshot_from_html,
    source_plan,
)


def test_gyoseishoshi_source_plan_is_explicit_and_https_only():
    assert {item["id"] for item in source_plan()} == {
        "source:gyoseishoshi:home",
        "source:gyoseishoshi:abstract",
        "source:gyoseishoshi:guide",
    }
    assert all(item["canonical_url"].startswith("https://") for item in source_plan())


def test_gyoseishoshi_source_boundary_rejects_unregistered_hosts():
    assert is_registered_source_url("https://www.gyosei-shiken.or.jp/doc/guide/guide.html")
    assert not is_registered_source_url("http://www.gyosei-shiken.or.jp/")
    assert not is_registered_source_url("https://example.com/")


def test_gyoseishoshi_adapter_requires_explicit_fields():
    snapshot = snapshot_from_html(
        "source:gyoseishoshi:guide",
        '<main><p data-fact-key="exam_subjects">法令等、基礎知識</p></main>',
        synthetic=False,
    )
    candidates, issues = extract_candidates(snapshot)
    assert not issues
    assert candidates[0].fact_key == "exam_subjects"
    assert candidates[0].status == "pending_review"
    assert candidates[0].synthetic is False


def test_gyoseishoshi_adapter_does_not_infer_from_prose():
    candidates, issues = extract_candidates(
        snapshot_from_html("source:gyoseishoshi:guide", "<p>令和8年度の試験案内です。受験料も掲載。</p>")
    )
    assert candidates == []
    assert issues[0].code == "structure_changed"


def test_gyoseishoshi_guide_extracts_labelled_high_risk_fields_with_evidence():
    html = """<main>
    <h2>受験資格</h2><p>年齢、学歴、国籍等に関係なく、どなたでも受験できます。</p>
    <h2>試験日及び試験時間</h2><p>試験日 令和８年１１月８日（日）</p>
    <h2>受験申込み</h2><h3>インターネットによる受験申込み</h3>
    <p>受付期間 令和８年７月２１日（火）午前９時から令和８年８月２４日（月）午後５時まで</p>
    <h2>受験手数料</h2><p>受験手数料は １０，４００円です。</p>
    <h2>試験方法</h2><p>試験は、筆記試験によって行います。</p>
    </main>"""
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:gyoseishoshi:guide", html, synthetic=False
    ))
    assert not issues
    by_key = {candidate.fact_key: candidate for candidate in candidates}
    assert set(by_key) == {"eligibility", "exam_date", "application_deadline", "fee", "exam_method"}
    assert by_key["exam_date"].normalized_value == "2026-11-08"
    assert by_key["application_deadline"].normalized_value == "2026-08-24T17:00:00+09:00"
    assert by_key["fee"].normalized_value == "10400"
    assert all(candidate.evidence_text for candidate in candidates)
