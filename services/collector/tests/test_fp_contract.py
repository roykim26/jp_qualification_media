from collector.fp import extract_candidates, is_registered_source_url, snapshot_from_html, source_plan
from pathlib import Path


def test_fp_registers_both_official_providers():
    plan = source_plan()
    assert len(plan) == 13
    assert {item["provider_id"] for item in plan} == {"jafp", "kinzai"}
    assert {item["allowed_domain"] for item in plan} == {"www.jafp.or.jp", "www.kinzai.or.jp"}


def test_fp_source_boundary_requires_exact_registered_https_url():
    assert is_registered_source_url("https://www.jafp.or.jp/exam/outline/")
    assert is_registered_source_url("https://www.kinzai.or.jp/ginou/fp/3kyu/index.html")
    assert is_registered_source_url("https://www.jafp.or.jp/exam/schedule/")
    assert is_registered_source_url("https://www.jafp.or.jp/exam/app/3fp.shtml")
    assert is_registered_source_url("https://www.kinzai.or.jp/ginou/fp/nittei-fp")
    assert is_registered_source_url("https://www.kinzai.or.jp/fp/nittei-fp/48581.html")
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


def test_priority_captured_snapshots_extract_43_dimensioned_candidates():
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
    assert len(candidates) == 43
    assert all(item.provider_id and item.exam_level_id and item.exam_component and item.delivery_mode for item in candidates)
    assert {item.provider_id for item in candidates} == {"jafp", "kinzai"}


def test_kinzai_2026_schedule_keeps_all_level_1_occurrences_per_delivery_mode():
    path = Path("var/official-snapshots/fp/kinzai-schedule-2026.html")
    if not path.exists():
        return
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:fp:kinzai-schedule-2026", path.read_text(encoding="utf-8"), synthetic=False
    ))
    assert not issues
    by_scope = {(item.fact_key, item.exam_component, item.delivery_mode): item for item in candidates}
    assert by_scope[("exam_dates", "academic", "pbt")].normalized_value == "2026-05-24,2026-09-13,2027-01-24"
    assert by_scope[("exam_dates", "practical:asset-consulting", "interview")].normalized_value == "2026-06-06,2026-06-13,2026-09-26,2026-10-03"
    assert by_scope[("application_deadline", "academic", "pbt")].normalized_value.endswith("2026-12-01T17:30:00+09:00")


def test_jafp_cbt_schedule_preserves_each_monthly_period_endpoint():
    path = Path("var/official-snapshots/fp/jafp-schedule.html")
    if not path.exists():
        return
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:fp:jafp-schedule", path.read_text(encoding="utf-8"), synthetic=False
    ))
    assert not issues
    academic = next(item for item in candidates if item.fact_key == "exam_dates" and item.exam_level_id == "fp:2" and item.exam_component == "academic")
    assert academic.normalized_value.startswith("2026-04-01,2026-04-30")
    assert academic.normalized_value.endswith("2027-03-01,2027-03-24")
    assert len(academic.normalized_value.split(",")) == 24


def test_kinzai_level_1_eligibility_preserves_academic_and_practical_dimensions():
    html = """<h2 id="aaa">1級</h2><table>
    <tr><th>学科試験</th><td>2級技能検定合格者で、FP業務に関し1年以上の実務経験を有する者</td></tr>
    <tr><th>実技試験</th><td>1級学科試験の合格者</td></tr>
    </table>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-eligibility", html, synthetic=False)
    )
    assert not issues
    assert {(item.exam_component, item.delivery_mode) for item in candidates} == {
        ("academic", "pbt"),
        ("practical:asset-consulting", "interview"),
    }
    assert all(item.fact_key == "eligibility" for item in candidates)
    academic = next(item for item in candidates if item.exam_component == "academic")
    practical = next(item for item in candidates if item.exam_component.startswith("practical"))
    assert "1級学科試験の合格者" not in academic.evidence_text
    assert "1級学科試験の合格者" in practical.evidence_text


def test_kinzai_level_1_academic_uses_exam_format_not_cbt_application_portal():
    html = """<p>CBT受検者専用サイトで受検申請を行います。</p>
    <h3 id="exam-time">試験時間</h3>
    <h3 id="exam-format">出題形式</h3><table><tr><th>区分</th></tr>
    <tr><td>基礎編</td><td>マークシート方式による筆記試験</td><td>50問</td></tr></table>
    <h3 id="exam-fee">受検手数料</h3><p>8,900円</p>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-1-academic", html, synthetic=False)
    )
    assert not issues
    assert candidates
    assert {item.delivery_mode for item in candidates} == {"pbt"}
    assert next(item for item in candidates if item.fact_key == "exam_method").normalized_value == "PBT"


def test_kinzai_level_1_practical_preserves_exact_evidence_for_review():
    html = """<h1>1級実技試験（資産相談業務）</h1>
    <h3 id="exam-format">審査</h3><ul class="list">
    <li>面接は、異なる設例課題に基づき、2回行います。</li>
    <li>複数の審査委員と対面の口述試験を行います。</li>
    <li>各面接の1人当たりの所要時間は約12分です。</li></ul>
    <h3 id="syutudai">出題形式</h3><p>口頭試問方式</p>
    <h3 id="exam-fee">受検手数料</h3><p>28,000円</p>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-1-practical", html, synthetic=False)
    )
    assert not issues
    by_key = {item.fact_key: item for item in candidates}
    assert "資産相談業務" in by_key["practical_subject"].evidence_text
    assert "対面の口述試験" in by_key["exam_method"].evidence_text
    assert "2回" in by_key["interview_count"].evidence_text
    assert "約12分" in by_key["exam_time"].evidence_text
