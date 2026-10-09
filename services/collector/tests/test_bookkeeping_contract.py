from collector.bookkeeping import (
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
    }
    assert all(item["allowed_domain"] == "www.kentei.ne.jp" for item in source_plan())


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


def test_ingest_dedup_key_ignores_jsonb_member_order():
    from collector.ingest_bookkeeping import value_key

    def key(value, display):
        return value_key("fee", "bookkeeping:1", "unified", 2026, value, display)

    assert key({"amount": 8800, "currency": "JPY"}, "1級 8,800円") == key(
        {"currency": "JPY", "amount": 8800}, "1級 8,800円"
    )
    assert key({"amount": 8800}, "1級 8,800円") != key({"amount": 8800}, "1級 8,800円（税込）")
