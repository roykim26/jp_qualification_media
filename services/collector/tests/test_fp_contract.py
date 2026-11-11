from collector.fp import extract_candidates, is_registered_source_url, snapshot_from_html, source_plan
from pathlib import Path


# Inline fixtures replicating the migrated products.kinzai.or.jp page structure
# (work package I).  The on-disk kinzai snapshots predate the domain migration and
# are only replaced by an authorized recapture, so the rewritten adapters are
# exercised from these fixtures instead of stale disk reads.
KINZAI_1_ACADEMIC_HTML = """<p>CBT受検者専用サイトで受検申請を行います。</p>
<h3 id="exam-time">試験時間</h3>
<table>
<tr><th>基礎編</th><td>10:00～12:30（150分）</td></tr>
<tr><th>応用編</th><td>13:30～16:00（150分）</td></tr>
</table>
<h3 id="exam-format">出題形式・合格基準</h3>
<table>
<tr><th>科目</th><th>出題形式</th><th>問題数</th><th>合格基準</th></tr>
<tr><th>基礎編</th><td>マークシート方式による筆記試験 （四答択一式）</td><td>50問</td><td>120点以上 （200点満点）</td></tr>
<tr><th>応用編</th><td>記述式による筆記試験 （事例形式）</td><td>5題</td></tr>
</table>
<h3 id="exam-fee">受検手数料</h3><p>8,900円 （非課税）</p>"""

KINZAI_1_PRACTICAL_HTML = """<h1></h1>
<h2>FP技能検定1級（実技）資産相談業務について</h2>
<p>ファイナンシャル・プランニング技能検定1級 実技試験（口頭試問方式）のご案内です。</p>
<h3 id="exam-format">審査の方法・配点等</h3>
<p>設例課題に基づく面接により、ファイナンシャル・プランナーに求められる技能を審査します。</p>
<ul class="list">
<li>面接は、異なる設例課題に基づき、2回行います。</li>
<li>いずれの面接も、「設例課題」に基づいて、複数の審査委員と対面の口述試験を行います。</li>
<li>配点は、1回目・2回目とも各100点の200点満点で、 合計120点以上が合格 となります。</li>
<li>「設例課題」は、それぞれ面接開始の約15分前に渡されます。各面接の1人当たりの所要時間は約12分です。</li>
</ul>
<h3 id="exam-fee">受検手数料</h3><p>28,000円 （非課税）</p>"""

KINZAI_ELIGIBILITY_HTML = """<h3 id="aaa">1級</h3>
<table>
<tr><th>学科／実技</th><th>受検資格</th></tr>
<tr><th>学科試験</th><td>2級技能検定合格者で、FP業務に関し1年以上の実務経験を有する者（注1）</td></tr>
<tr><td>FP業務に関し5年以上の実務経験を有する者</td></tr>
<tr><td>厚生労働省認定金融渉外技能審査2級の合格者で、1年以上の実務経験を有する者（注1）</td></tr>
<tr><th>実技試験</th><td>1級技能検定の合格者</td></tr>
<tr><td>1級学科試験の合格者（注2）</td></tr>
<tr><td>日本FP協会のCFP認定者（注3）※</td></tr>
<tr><td>日本FP協会のCFP資格審査試験の合格者（注4）※</td></tr>
<tr><td>「FP養成コース」修了者でFP業務に関し1年以上の実務経験を有する者（注1）（注4）※</td></tr>
</table>"""

KINZAI_SCHEDULE_HTML = """<h2>1級学科試験</h2>
<h4>試験日　2026年5月24日（日）</h4>
<table>
<tr><th>受検申請受付期間</th><td>2026年3月9日（月）10：00～ 4月2日（木）17：30</td></tr>
<tr><th>受検票ダウンロード開始日</th><td>2026年4月27日（月）10：00</td></tr>
<tr><th>合格発表日（予定）</th><td>2026年6月30日（火）10：00</td></tr>
</table>
<h4>試験日　2026年9月13日（日）</h4>
<table>
<tr><th>受検申請受付期間</th><td>2026年7月1日（水）10：00～ 7月28日（火）17：30</td></tr>
<tr><th>受検票ダウンロード開始日</th><td>2026年8月21日（金）10：00</td></tr>
<tr><th>合格発表日（予定）</th><td>2026年10月27日（火）10：00</td></tr>
</table>
<h4>試験日　2027年1月24日（日）</h4>
<table>
<tr><th>受検申請受付期間</th><td>2026年10月28日（水）10：00～ 12月1日（火）17：30</td></tr>
<tr><th>受検票ダウンロード開始日</th><td>2026年12月24日（木）10：00</td></tr>
<tr><th>合格発表日（予定）</th><td>2027年3月5日（金）10：00</td></tr>
</table>
<h2>1級実技試験</h2>
<h4>実施月　2026年6月上旬～中旬</h4>
<table>
<tr><th>受検申請受付期間</th><td>2026年3月23日(月)10：00～4月16日(木)17：30</td></tr>
<tr><th>受検票ダウンロード開始日</th><td>2026年5月18日(月)10：00</td></tr>
<tr><th>試験日</th><th>東京</th><td>2026年6月6日（土）・7日（日）</td></tr>
<tr><th>名古屋</th><td>2026年6月13日（土）・14日（日）</td></tr>
<tr><th>大阪</th><td>2026年6月13日（土）・14日（日）</td></tr>
<tr><th>岡山</th><td>2026年6月6日（土）</td></tr>
<tr><th>福岡</th><td>2026年6月13日（土）・14日（日）</td></tr>
<tr><th>合格発表日（予定）</th><td>2026年7月9日(木)10：00</td></tr>
</table>
<h4>実施月　2026年9月下旬～10月上旬</h4>
<table>
<tr><th>受検申請受付期間</th><td>2026年7月21日(火)10：00～8月13日(木)17：30</td></tr>
<tr><th>受検票ダウンロード開始日</th><td>2026年9月7日(月)10：00</td></tr>
<tr><th>試験日</th><th>東京</th><td>2026年9月26日（土）・27日（日）</td></tr>
<tr><th>名古屋</th><td>2026年10月3日（土）・4日（日）</td></tr>
<tr><th>大阪</th><td>2026年10月3日（土）・4日（日）</td></tr>
<tr><th>岡山</th><td>2026年9月26日（土）</td></tr>
<tr><th>福岡</th><td>2026年10月3日（土）</td></tr>
<tr><th>合格発表日（予定）</th><td>2026年10月30日(金)10：00</td></tr>
</table>
<h4>実施月　2027年2月上旬～中旬</h4>
<table>
<tr><th>受検申請受付期間</th><td>2026年11月16日(月)10：00～12月11日(金)17：30</td></tr>
<tr><th>受検票ダウンロード開始日</th><td>2027年1月18日(月)10：00</td></tr>
<tr><th>試験日</th><th>東京</th><td>2027年2月6日（土）・7日（日）</td></tr>
<tr><th>名古屋</th><td>2027年2月13日（土）・14日（日）</td></tr>
<tr><th>大阪</th><td>2027年2月13日（土）・14日（日）</td></tr>
<tr><th>岡山</th><td>2027年2月6日（土）</td></tr>
<tr><th>福岡</th><td>2027年2月13日（土）</td></tr>
<tr><th>合格発表日（予定）</th><td>2027年3月15日(月)10：00</td></tr>
</table>"""


def test_fp_registers_both_official_providers():
    plan = source_plan()
    assert len(plan) == 12
    assert {item["provider_id"] for item in plan} == {"jafp", "kinzai"}
    assert {item["allowed_domain"] for item in plan} == {"www.jafp.or.jp", "products.kinzai.or.jp"}


def test_fp_source_boundary_requires_exact_registered_https_url():
    assert is_registered_source_url("https://www.jafp.or.jp/exam/outline/")
    assert is_registered_source_url("https://products.kinzai.or.jp/exam-fp/3kyu/")
    assert is_registered_source_url("https://www.jafp.or.jp/exam/schedule/")
    assert is_registered_source_url("https://www.jafp.or.jp/exam/app/3fp.shtml")
    assert is_registered_source_url("https://products.kinzai.or.jp/exam-fp/eligibility/")
    assert is_registered_source_url("https://products.kinzai.or.jp/exam-fp/schedule/")
    assert not is_registered_source_url("http://www.jafp.or.jp/exam/outline/")
    assert not is_registered_source_url("https://www.jafp.or.jp/unregistered")
    # The retired schedule index and every pre-migration kinzai URL are gone.
    assert not is_registered_source_url("https://www.kinzai.or.jp/ginou/fp/nittei-fp")
    assert not is_registered_source_url("https://www.kinzai.or.jp/ginou/fp/3kyu/index.html")
    assert not is_registered_source_url("https://www.kinzai.or.jp/fp/nittei-fp/48581.html")


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


def test_priority_captured_snapshots_extract_51_dimensioned_candidates():
    jafp_path = Path("var/official-snapshots/fp/jafp-2-3-outline.html")
    if not jafp_path.exists():
        return
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:fp:jafp-2-3-outline", jafp_path.read_text(encoding="utf-8"), synthetic=False
    ))
    assert not issues
    for source, html in (
        ("source:fp:kinzai-1-academic", KINZAI_1_ACADEMIC_HTML),
        ("source:fp:kinzai-1-practical", KINZAI_1_PRACTICAL_HTML),
    ):
        parsed, parse_issues = extract_candidates(snapshot_from_html(source, html, synthetic=False))
        assert not parse_issues
        candidates.extend(parsed)
    assert len(candidates) == 51
    assert all(item.provider_id and item.exam_level_id and item.exam_component and item.delivery_mode for item in candidates)
    assert {item.provider_id for item in candidates} == {"jafp", "kinzai"}


def test_kinzai_2026_schedule_keeps_all_level_1_occurrences_per_delivery_mode():
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:fp:kinzai-schedule-2026", KINZAI_SCHEDULE_HTML, synthetic=False
    ))
    assert not issues
    assert len(candidates) == 10
    by_scope = {(item.fact_key, item.exam_component, item.delivery_mode): item for item in candidates}
    assert by_scope[("exam_dates", "academic", "pbt")].normalized_value == "2026-05-24,2026-09-13,2027-01-24"
    # The migrated page keeps the 2027年2月 practical window the old extractor missed.
    assert by_scope[("exam_dates", "practical:asset-consulting", "interview")].normalized_value == "2026-06-06,2026-06-13,2026-09-26,2026-10-03,2027-02-06,2027-02-13"
    assert by_scope[("application_deadline", "academic", "pbt")].normalized_value.endswith("2026-12-01T17:30:00+09:00")
    assert by_scope[("application_open", "practical:asset-consulting", "interview")].normalized_value == "2026-03-23T10:00:00+09:00,2026-07-21T10:00:00+09:00,2026-11-16T10:00:00+09:00"
    assert by_scope[("result_date", "practical:asset-consulting", "interview")].normalized_value == "2026-07-09,2026-10-30,2027-03-15"


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
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-eligibility", KINZAI_ELIGIBILITY_HTML, synthetic=False)
    )
    assert not issues
    assert {(item.exam_component, item.delivery_mode) for item in candidates} == {
        ("academic", "pbt"),
        ("practical:asset-consulting", "interview"),
    }
    assert all(item.fact_key == "eligibility" for item in candidates)
    academic = next(item for item in candidates if item.exam_component == "academic")
    practical = next(item for item in candidates if item.exam_component.startswith("practical"))
    assert academic.normalized_value == "2級技能検定合格者で、FP業務に関し1年以上の実務経験を有する者（注1） / FP業務に関し5年以上の実務経験を有する者 / 厚生労働省認定金融渉外技能審査2級の合格者で、1年以上の実務経験を有する者（注1）"
    assert practical.normalized_value == "1級技能検定の合格者 / 1級学科試験の合格者（注2） / 日本FP協会のCFP認定者（注3）※ / 日本FP協会のCFP資格審査試験の合格者（注4）※ / 「FP養成コース」修了者でFP業務に関し1年以上の実務経験を有する者（注1）（注4）※"
    assert "1級学科試験の合格者" not in academic.evidence_text
    assert "1級学科試験の合格者" in practical.evidence_text


def test_kinzai_level_1_academic_uses_exam_format_not_cbt_application_portal():
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-1-academic", KINZAI_1_ACADEMIC_HTML, synthetic=False)
    )
    assert not issues
    assert len(candidates) == 8
    assert {item.delivery_mode for item in candidates} == {"pbt"}
    by_key = {(item.fact_key, item.exam_component): item for item in candidates}
    assert by_key[("exam_method", "academic")].normalized_value == "PBT"
    assert by_key[("exam_time", "academic")].normalized_value == "300"
    assert by_key[("passing_standard", "academic")].normalized_value == "120/200"
    assert by_key[("fee", "academic")].normalized_value == "8900"
    assert by_key[("question_count", "academic:basic")].normalized_value == "50"
    assert by_key[("question_count", "academic:applied")].normalized_value == "5"


def test_kinzai_1_academic_th_row_labels_never_misparse_to_120200():
    # Work package I §3: the migrated page moved the 基礎編/応用編 row labels from
    # td into th and dropped the 応用編 合格基準 cell.  The old positional td[:3]
    # read misparsed 応用編 question_count to 120200 and question_format to 50問.
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-1-academic", KINZAI_1_ACADEMIC_HTML, synthetic=False)
    )
    assert not issues
    by_key = {(item.fact_key, item.exam_component): item for item in candidates}
    assert by_key[("question_count", "academic:basic")].normalized_value == "50"
    assert by_key[("question_count", "academic:applied")].normalized_value == "5"
    assert by_key[("question_format", "academic:basic")].normalized_value == "マークシート方式による筆記試験 （四答択一式）"
    assert by_key[("question_format", "academic:applied")].normalized_value == "記述式による筆記試験 （事例形式）"
    assert all(item.normalized_value != "120200" for item in candidates)


def test_kinzai_1_academic_legacy_td_layout_fails_safe():
    # The pre-migration td-label layout carries no 合格基準 column and no parseable
    # 試験時間 table; the rewritten adapter must fail safe, never silently misparse.
    html = """<h3 id="exam-time">試験時間</h3>
    <h3 id="exam-format">出題形式</h3><table><tr><th>区分</th></tr>
    <tr><td>基礎編</td><td>マークシート方式による筆記試験</td><td>50問</td></tr></table>
    <h3 id="exam-fee">受検手数料</h3><p>8,900円</p>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-1-academic", html, synthetic=False)
    )
    assert candidates == []
    assert issues[0].code == "structure_changed"


def test_kinzai_level_1_practical_preserves_exact_evidence_for_review():
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-1-practical", KINZAI_1_PRACTICAL_HTML, synthetic=False)
    )
    assert not issues
    assert len(candidates) == 7
    by_key = {item.fact_key: item for item in candidates}
    assert "資産相談業務" in by_key["practical_subject"].evidence_text
    assert "対面の口述試験" in by_key["exam_method"].evidence_text
    assert "2回" in by_key["interview_count"].evidence_text
    assert "約12分" in by_key["exam_time"].evidence_text
    assert by_key["interview_count"].normalized_value == "2"
    # li carries 約15分 (handout lead time) too; the duration must stay 12.
    assert by_key["exam_time"].normalized_value == "12"
    assert by_key["passing_standard"].normalized_value == "120/200"
    assert by_key["fee"].normalized_value == "28000"


def test_kinzai_1_practical_missing_evidence_sentence_fails_safe():
    # Drop the passing-standard sentence: a high-risk field must never be inferred.
    html = KINZAI_1_PRACTICAL_HTML.replace(
        "<li>配点は、1回目・2回目とも各100点の200点満点で、 合計120点以上が合格 となります。</li>", ""
    )
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:kinzai-1-practical", html, synthetic=False)
    )
    assert candidates == []
    assert issues[0].code == "structure_changed"


def test_jafp_2_3_application_rules_use_published_cbt_availability():
    html = """<p>学科試験及び実技試験とも、全国で随時受検ができるCBT試験へ完全移行しました。</p>
    <table><tr><td>試験日時</td><td>休止期間を除き、テストセンターの空いている日時から選択可能です。</td></tr></table>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:jafp-2-3-outline", html, synthetic=False)
    )
    assert not issues
    rules = {
        (item.fact_key, item.exam_level_id, item.exam_component, item.delivery_mode): item
        for item in candidates
        if item.fact_key.endswith("_rule")
    }
    assert {key[0] for key in rules} == {"application_open_rule", "application_deadline_rule"}
    assert len(rules) == 8
    opening = rules[("application_open_rule", "fp:2", "academic", "cbt")]
    assert opening.normalized_value == "随時"
    assert "随時受検ができるCBT" in opening.evidence_text
    deadline = rules[("application_deadline_rule", "fp:3", "practical:asset-design", "cbt")]
    assert deadline.normalized_value == "締切日なし"
    assert "休止期間を除き、テストセンターの空いている日時" in deadline.evidence_text


def test_jafp_2_3_application_rules_stay_without_dates_when_availability_is_absent():
    html = '<p data-fact-key="fee" data-provider="jafp" data-exam-level="2" data-exam-component="academic" data-delivery-mode="cbt">6,000円</p>'
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:jafp-2-3-outline", html, synthetic=False)
    )
    assert not issues
    assert not [item for item in candidates if item.fact_key.endswith("_rule")]


def test_captured_jafp_outline_publishes_rule_candidates_for_review():
    path = Path("var/official-snapshots/fp/jafp-2-3-outline.html")
    if not path.exists():
        return
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:jafp-2-3-outline", path.read_text(encoding="utf-8"), synthetic=False)
    )
    assert not issues
    assert {(item.fact_key, item.exam_level_id) for item in candidates if item.fact_key.endswith("_rule")} == {
        ("application_open_rule", "fp:2"), ("application_open_rule", "fp:3"),
        ("application_deadline_rule", "fp:2"), ("application_deadline_rule", "fp:3"),
    }
