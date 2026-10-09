from collector.bookkeeping import (
    BOOKLET_PHRASE,
    extract_candidates,
    is_registered_source_url,
    snapshot_from_bytes,
    snapshot_from_html,
    source_plan,
)
from pathlib import Path


def test_bookkeeping_source_plan_is_explicit_and_official():
    assert {item["id"] for item in source_plan()} == {
        "source:bookkeeping:home",
        "source:bookkeeping:network",
        "source:bookkeeping:calendar-2026",
        "source:bookkeeping:class1-exam",
        "source:bookkeeping:class2-exam",
        "source:bookkeeping:class1",
        "source:bookkeeping:class2",
        "source:bookkeeping:class3",
        "source:bookkeeping:class3-exam",
        "source:bookkeeping:flow",
        "source:bookkeeping:flow-teller",
        "source:bookkeeping:flow-net",
        "source:bookkeeping:report",
        "source:bookkeeping:qa",
        "source:bookkeeping:news-51504",
    }
    assert all(item["allowed_domain"] == "www.kentei.ne.jp" for item in source_plan())
    assert all(
        item["canonical_url"].startswith("https://www.kentei.ne.jp")
        for item in source_plan()
    )


def test_bookkeeping_source_boundary_is_exact():
    assert is_registered_source_url("https://www.kentei.ne.jp/bookkeeping")
    assert not is_registered_source_url("http://www.kentei.ne.jp/bookkeeping")
    assert not is_registered_source_url("https://www.kentei.ne.jp/unregistered")
    assert not is_registered_source_url("https://example.com/bookkeeping")


def test_bookkeeping_contract_preserves_level_and_delivery_mode():
    html = """
    <p data-fact-key="exam_time" data-exam-level="2" data-delivery-mode="network"
       data-normalized-value="90" data-value-type="integer">試験時間 90分</p>
    <p data-fact-key="question_format" data-exam-level="3" data-delivery-mode="network"
       data-normalized-value="selection_and_input">選択式＋入力式 3題以内</p>
    """
    candidates, issues = extract_candidates(snapshot_from_html("source:bookkeeping:network", html, synthetic=False))
    assert not issues
    assert candidates[0].exam_level_id == "bookkeeping:2"
    assert candidates[0].delivery_mode == "network"
    assert candidates[0].normalized_value == "90"
    assert all(candidate.synthetic is False for candidate in candidates)


def test_bookkeeping_contract_rejects_missing_dimensions():
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:bookkeeping:network", '<p data-fact-key="exam_time">90分</p>'
    ))
    assert candidates == []
    assert issues[0].code == "structure_changed"


def test_bookkeeping_bytes_snapshot_keeps_raw_hash_without_newline_rewrite():
    body = b"<p data-fact-key=\"exam_time\" data-exam-level=\"2\" data-delivery-mode=\"network\">90\r\n</p>"
    snapshot = snapshot_from_bytes("source:bookkeeping:network", body, synthetic=False)

    assert snapshot.content_hash != snapshot_from_html(
        "source:bookkeeping:network", snapshot.html.replace("\r\n", "\n"), synthetic=False
    ).content_hash


def test_captured_network_snapshot_extracts_all_four_level_fees():
    path = Path("var/official-snapshots/bookkeeping/network.html")
    if not path.exists():
        return
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:bookkeeping:network", path.read_text(encoding="utf-8"), synthetic=False
    ))
    assert not issues
    fees = {(item.exam_level_id, item.normalized_value) for item in candidates if item.fact_key == "fee"}
    assert fees == {
        ("bookkeeping:2", "5500"), ("bookkeeping:3", "3300"),
        ("bookkeeping:basic", "2200"), ("bookkeeping:cost-accounting-basic", "2200"),
    }


def test_home_snapshot_declares_chamber_defined_application_rules():
    html = """<p>申込受付日時、申込受付方法は、商工会議所によって異なります。試験日の約２か月前になりましたら、
    受験希望地の商工会議所までお問い合わせください。</p>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:home", html, synthetic=False)
    )
    assert not issues
    assert {(item.fact_key, item.exam_level_id, item.delivery_mode) for item in candidates} == {
        (key, f"bookkeeping:{level}", "unified")
        for key in ("application_open_rule", "application_deadline_rule", "application_method_rule")
        for level in ("1", "2", "3")
    }
    assert all(item.normalized_value == "venue_defined" for item in candidates)
    assert all("商工会議所によって異なります" in item.evidence_text for item in candidates)


def test_level_exam_snapshot_declares_chamber_defined_result_date():
    html = """<div class="postContent"><table><tr><td>合格基準</td><td>70%以上</td></tr></table></div>
    <p>合格発表の期日や方法、証書の受け渡し方法等は、商工会議所によって異なります。申し込みの際にご確認ください。</p>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:class1-exam", html, synthetic=False)
    )
    assert not issues
    rule = next(item for item in candidates if item.fact_key == "result_date_rule")
    assert (rule.exam_level_id, rule.delivery_mode, rule.normalized_value) == ("bookkeeping:1", "unified", "venue_defined")
    assert "合格発表の期日や方法" in rule.evidence_text


def test_network_snapshot_keeps_official_exam_method_wording():
    html = """<h1>日商簿記検定試験ネット試験について</h1>
    <p>※年3回の統一試験（ペーパー形式）の前後に、日商簿記検定試験（２級・３級）ネット試験の施行休止期間を設定しています。</p>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:network", html, synthetic=False)
    )
    assert not issues
    by_scope = {
        (item.exam_level_id, item.delivery_mode): item
        for item in candidates
        if item.fact_key == "exam_method"
    }
    assert by_scope[("bookkeeping:1", "unified")].normalized_value == "ペーパー形式"
    assert "統一試験（ペーパー形式）" in by_scope[("bookkeeping:1", "unified")].evidence_text
    assert by_scope[("bookkeeping:2", "network")].normalized_value == "ネット試験"
    assert not any(item.fact_key == "exam_method" and item.normalized_value in {"paper", "CBT"} for item in candidates)


def test_calendar_snapshot_stops_asserting_an_unpublished_format():
    html = """<h2>簿記 1級~3級（統一試験）</h2>
    <table><tr><td>試験日</td><td>2026年6月14日</td><td>2026年11月15日</td></tr>
    <tr><td>受験料（税込）</td><td>8,800円</td><td>5,500円</td><td>3,300円</td></tr></table>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:calendar-2026", html, synthetic=False)
    )
    assert not issues
    assert not any(item.fact_key == "exam_method" for item in candidates)


def test_class1_exam_snapshot_keeps_answer_sheet_retrieval_wording():
    html = """<div class="postContent"><table><tr><td>試験時間</td><td>90分</td><td>90分</td></tr>
    <tr><td>合格基準</td><td>平均70%以上（各科目40%以上）</td></tr></table></div>
    <p>試験終了後、答案用紙を回収します。</p>
    <p>試験問題・計算用紙については、持ち帰りを認めます。</p>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:class1-exam", html, synthetic=False)
    )
    assert not issues
    formats = [item for item in candidates if item.fact_key == "question_format"]
    assert len(formats) == 1
    assert (formats[0].exam_level_id, formats[0].delivery_mode) == ("bookkeeping:1", "unified")
    assert formats[0].normalized_value == "答案用紙を回収します"
    assert formats[0].display_value == (
        "試験終了後、答案用紙を回収します。試験問題・計算用紙については、持ち帰りを認めます。"
    )


def test_level_exam_pages_keep_distinct_answer_sheet_wording():
    html = """<div class="postContent"><table><tr><td>試験時間</td><td>90分</td></tr></table></div>
    <p>試験会場では、問題用紙・答案用紙・計算用紙が一体となった冊子を配布し、試験終了後に全て回収いたします。</p>"""
    for source, level in (("source:bookkeeping:class2-exam", "2"), ("source:bookkeeping:class3-exam", "3")):
        candidates, issues = extract_candidates(snapshot_from_html(source, html, synthetic=False))
        assert not issues
        formats = [item for item in candidates if item.fact_key == "question_format"]
        assert [item.exam_level_id for item in formats] == [f"bookkeeping:{level}"]
        assert formats[0].normalized_value == BOOKLET_PHRASE
        assert "答案用紙を回収します" not in formats[0].display_value


def test_parse_stops_when_answer_format_sentence_is_absent():
    html = '<div class="postContent"><table><tr><td>試験時間</td><td>60分</td></tr></table></div>'
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:class3-exam", html, synthetic=False)
    )
    assert candidates == []
    assert issues[0].code == "structure_changed"


def test_qa_snapshot_keeps_level_order_eligibility_within_official_wording():
    html = """<ul>
    <li>商工会議所の検定試験は、どの級(クラス)から受験していただいても構いません。例えば、3級に合格していなくても、2級あるいは1級を受験できます。</li>
    <li>DCプランナー1級を受験していただくには、2級に合格していることが必要です。</li></ul>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:qa", html, synthetic=False)
    )
    assert not issues
    items = [item for item in candidates if item.fact_key == "eligibility"]
    assert {item.exam_level_id for item in items} == {"bookkeeping:1", "bookkeeping:2", "bookkeeping:3"}
    assert all(item.delivery_mode == "unified" for item in items)
    assert all(item.normalized_value == "どの級(クラス)から受験していただいても構いません" for item in items)
    assert all("2級あるいは1級を受験できます" in item.display_value for item in items)
    assert not any("DC" in item.display_value for item in items)


def test_flow_teller_snapshot_declares_chamber_defined_payment_rule():
    html = """<ol>
    <li>受験申込受付期間は、商工会議所によって異なります。申し込みの際にご確認ください。</li>
    <li>試験日の2ヵ月前を目安に（受付開始日は商工会議所により異なります。）受験を希望する商工会議所へ
    お問い合わせのうえ、受験料の支払方法等をご確認ください。</li></ol>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:bookkeeping:flow-teller", html, synthetic=False)
    )
    assert not issues
    items = [item for item in candidates if item.fact_key == "payment_deadline_rule"]
    assert {item.exam_level_id for item in items} == {"bookkeeping:1", "bookkeeping:2", "bookkeeping:3"}
    assert all(item.delivery_mode == "unified" for item in items)
    assert all(item.normalized_value == "venue_defined" for item in items)
    assert all(item.display_value.startswith("試験日の2ヵ月前を目安に（") for item in items)
    assert all("（受付開始日は商工会議所により異なります。）" in item.display_value for item in items)
    assert all("受験料の支払方法等をご確認ください。" in item.display_value for item in items)
    assert all("受験申込受付期間は、商工会議所によって異なります。" in item.display_value for item in items)


def test_ingest_dedup_key_ignores_jsonb_member_order():
    from collector.ingest_bookkeeping import value_key

    def key(value, display):
        return value_key("fee", "bookkeeping:1", "unified", 2026, value, display)

    assert key({"amount": 8800, "currency": "JPY"}, "1級 8,800円") == key(
        {"currency": "JPY", "amount": 8800}, "1級 8,800円"
    )
    assert key({"amount": 8800}, "1級 8,800円") != key({"amount": 8800}, "1級 8,800円（税込）")
