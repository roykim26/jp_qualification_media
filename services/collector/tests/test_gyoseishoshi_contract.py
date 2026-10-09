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
    assert set(by_key) == {"eligibility", "exam_date", "application_open", "application_deadline", "fee", "exam_method"}
    assert by_key["exam_date"].normalized_value == "2026-11-08"
    assert by_key["application_deadline"].normalized_value == "2026-08-24T17:00:00+09:00"
    assert by_key["fee"].normalized_value == "10400"
    assert all(candidate.evidence_text for candidate in candidates)


def test_gyoseishoshi_guide_extracts_only_explicit_schedule_and_exam_content_fields():
    html = """<main>
    <h2>試験日及び試験時間</h2><dl><dt>試験時間</dt><dd>午後１時から午後４時まで</dd></dl>
    <h2>受験申込み</h2><p>受験申込みには「インターネットによる受験申込み」と「郵送による受験申込み」の２つの方法があります。</p>
    <h3>インターネットによる受験申込み</h3><h3>受付期間</h3>
    <p>令和８年７月２１日（火）午前９時から令和８年８月２４日（月）午後５時まで</p>
    <h2>試験科目及び方法</h2>
    <table class="info-table"><tr><td>行政書士の業務に関し必要な法令等（出題数４６題）</td></tr><tr><td>行政書士の業務に関し必要な基礎知識（出題数１４題）</td></tr></table>
    <p>出題の形式は、択一式及び記述式とし、基礎知識は択一式とします。 記述式は、４０字程度で記述するものを出題します。</p>
    <h2>合格発表</h2><p>合格発表は、令和９年１月２７日（水）午前９時から合格者の受験番号を公示します。</p>
    <h2>合格基準</h2><p>次の要件のいずれも満たした者を合格とします。 ① 法令等科目の得点が、満点の５０パーセント以上である者 ② 基礎知識科目の得点が、満点の４０パーセント以上である者 ③ 試験全体の得点が、満点の６０パーセント以上である者</p>
    </main>"""
    candidates, issues = extract_candidates(snapshot_from_html("source:gyoseishoshi:guide", html, synthetic=False))
    assert not issues
    by_key = {candidate.fact_key: candidate for candidate in candidates}
    assert by_key["application_open"].normalized_value == "2026-07-21T09:00:00+09:00"
    assert by_key["application_method"].normalized_value == "インターネットによる受験申込み・郵送による受験申込み"
    assert by_key["exam_time"].normalized_value == "180"
    assert by_key["question_count"].normalized_value == "60"
    assert by_key["question_format"].normalized_value == "択一式・記述式"
    assert by_key["result_date"].normalized_value == "2027-01-27"
    assert by_key["passing_standard"].normalized_value == "法令等50%以上・基礎知識40%以上・全体60%以上"


def test_gyoseishoshi_guide_extracts_explicit_scoring_method():
    html = """<main><p>択一式問題の採点を完了した段階で合格基準を満たしていないと認められる場合には、記述式問題の採点を行わないことがあります。</p></main>"""
    candidates, issues = extract_candidates(snapshot_from_html("source:gyoseishoshi:guide", html, synthetic=False))
    assert not issues
    assert candidates[0].fact_key == "scoring_method"
    assert candidates[0].evidence_text == "択一式問題の採点を完了した段階で合格基準を満たしていないと認められる場合には、記述式問題の採点を行わないことがあります。"
