from collector.bookkeeping import (
    extract_candidates,
    is_registered_source_url,
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
