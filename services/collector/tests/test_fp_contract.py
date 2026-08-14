from collector.fp import extract_candidates, is_registered_source_url, snapshot_from_html, source_plan
from pathlib import Path


def test_fp_registers_both_official_providers():
    plan = source_plan()
    assert len(plan) == 9
    assert {item["provider_id"] for item in plan} == {"jafp", "kinzai"}
    assert {item["allowed_domain"] for item in plan} == {"www.jafp.or.jp", "www.kinzai.or.jp"}


def test_fp_source_boundary_requires_exact_registered_https_url():
    assert is_registered_source_url("https://www.jafp.or.jp/exam/outline/")
    assert is_registered_source_url("https://www.kinzai.or.jp/ginou/fp/3kyu/index.html")
    assert not is_registered_source_url("http://www.jafp.or.jp/exam/outline/")
    assert not is_registered_source_url("https://www.jafp.or.jp/unregistered")


def test_fp_contract_keeps_provider_level_component_and_cbt_dimensions():
    html = '''<p data-fact-key="exam_time" data-provider="jafp" data-exam-level="2"
      data-exam-component="academic" data-delivery-mode="cbt"
      data-normalized-value="120" data-value-type="integer">学科試験 120分</p>'''
    candidates, issues = extract_candidates(snapshot_from_html("source:fp:jafp-2-3-outline", html, synthetic=False))
    assert not issues
    candidate = candidates[0]
    assert (candidate.provider_id, candidate.exam_level_id, candidate.exam_component, candidate.delivery_mode) == ("jafp", "fp:2", "academic", "cbt")
    assert candidate.synthetic is False


def test_fp_contract_rejects_provider_source_mismatch():
    html = '''<p data-fact-key="exam_method" data-provider="kinzai" data-exam-level="2"
      data-exam-component="academic" data-delivery-mode="cbt">CBT</p>'''
    candidates, issues = extract_candidates(snapshot_from_html("source:fp:jafp-2-3-outline", html))
    assert candidates == []
    assert issues[0].code == "invalid_contract_dimensions"


def test_priority_captured_snapshots_extract_39_dimensioned_candidates():
    mapping = {
        "jafp-2-3-outline.html": "source:fp:jafp-2-3-outline",
        "kinzai-1-academic.html": "source:fp:kinzai-1-academic",
        "kinzai-1-practical.html": "source:fp:kinzai-1-practical",
    }
    root = Path("var/official-snapshots/fp")
    if not all((root / name).exists() for name in mapping):
        return
    candidates = []
    for name, source in mapping.items():
        parsed, issues = extract_candidates(snapshot_from_html(source, (root / name).read_text(encoding="utf-8"), synthetic=False))
        assert not issues
        candidates.extend(parsed)
    assert len(candidates) == 39
    assert all(item.provider_id and item.exam_level_id and item.exam_component and item.delivery_mode for item in candidates)
    assert {item.provider_id for item in candidates} == {"jafp", "kinzai"}
