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

# The live schedule page publishes two 年度 sections; the 2027 CBT table ships
# with unclosed <tr> tags so html.parser nests each later row inside the
# previous one.  This fixture reproduces that malformed shape verbatim.
JAFP_SCHEDULE_HTML = """<h1>FP技能検定　試験日程</h1>
<h2>2026年度　試験日程</h2>
<h3>1級FP技能検定　実技試験（資産設計提案業務）</h3>
<table>
<tr><th>試験日</th><th>受検申請期間</th><th>合格発表日</th><th>法令基準日</th></tr>
<tr><td>2026年9月13日（日）</td><td>7/16～8/6</td><td>11月12日</td><td>2026年4月1日</td></tr>
</table>
<h3>2級・3級FP技能検定　学科及び実技試験（資産設計提案業務）　※CBT試験</h3>
<table>
<tr><th>試験日</th><th>合格発表日</th><th>法令基準日</th></tr>
<tr><td>2026年4月1日～4月30日</td><td>5月20日</td><td rowspan="2">2025年4月1日</td></tr>
<tr><td>2026年5月1日～5月23日</td><td>6月15日</td></tr>
</table>
<h3>※2級・3級CBT試験 休止期間</h3>
<table><tr><td>2026年度</td><td>2026年5月24日～5月31日</td></tr></table>
<h2>2027年度　試験日程</h2>
<h3>1級FP技能検定　実技試験（資産設計提案業務）</h3>
<table>
<tr><th>試験日</th><th>受検申請期間</th><th>合格発表日</th><th>法令基準日</th></tr>
<tr><td>2027年9月12日（日）</td><td>7/15～8/5</td><td>11月2日</td><td>2027年4月1日</td></tr>
</table>
<h3>2級・3級FP技能検定　学科及び実技試験（資産設計提案業務）　※CBT試験</h3>
<table>
<tr><th>試験日</th><th>合格発表日</th><th>法令基準日</th></tr>
<tr><td>2027年4月1日～4月30日</td><td>5月20日</td><td rowspan="2">2026年4月1日</td></tr>
<tr><td>2027年5月1日～5月22日</td><td>6月15日</td>
<tr><td>2027年6月1日～6月30日</td><td>7月15日</td><td rowspan="10">2027年4月1日</td></tr>
<tr><td>2027年7月1日～7月31日</td><td>8月17日</td>
<tr><td>2027年8月1日～8月31日</td><td>9月15日</td>
<tr><td>2027年9月1日～9月30日</td><td>10月18日</td>
<tr><td>2027年10月1日～10月31日</td><td>11月16日</td>
<tr><td>2027年11月1日～11月30日</td><td>12月15日</td>
<tr><td>2027年12月1日～12月27日</td><td>1月19日</td>
<tr><td>2028年1月6日～1月31日</td><td>2月16日</td>
<tr><td>2028年2月1日～2月29日</td><td>3月15日</td>
<tr><td>2028年3月1日～3月24日</td><td>4月17日</td>
</tr></tr></tr></tr></tr></tr></tr></tr></tr></tr></table>
<h3>※2級・3級CBT試験 休止期間</h3>
<table><tr><td>2027年度</td><td>2027年5月23日～5月31日</td></tr></table>"""

# Fixture mirroring the captured 1級FP技能検定試験要綱 page (2026年9月): the
# 試験時間 line, the 出題形式・合格基準 table, the 受検資格 1）～5） list and the
# 受検手数料 sentence the 1級 PBT dimension is read from.
JAFP_1_OUTLINE_HTML = """<p class="txtBold txtBlue">2026年9月　1級FP技能検定試験要綱</p>
<h2 id="Section02" class="cmnH2">試験日程・試験時間</h2>
<div class="cmnSection">
<h3 class="cmnH3">試験時間</h3>
<p>13:30～15:30　（120分）</p>
<p>※試験の注意説明がありますので、13：10までに必ず着席してください。</p>
</div>
<h2 id="Section03" class="cmnH2">出題形式・合格基準・試験範囲</h2>
<div class="cmnSection">
<table class="cmnTable"><tbody>
<tr><th>&nbsp;</th><th>試験種類</th><th>出題形式</th><th>問題数</th><th>合格基準</th></tr>
<tr><th>1級</th><td class="taCenter">実技</td><td class="taCenter">筆記（記述式）</td><td class="taCenter">2題（20問）</td><td class="taCenter">60点以上（100点満点）</td></tr>
</tbody></table>
</div>
<h2 id="Section05" class="cmnH2">受検資格</h2>
<div class="cmnSection">
<p class="mb15">下記1）～5）のいずれかに該当する者</p>
<p class="txtBold">1）日本FP協会認定のCFP認定者</p>
<p>※退会などでCFP認定者の資格が失効した場合、受検資格はなくなります。</p>
<p class="txtBold">2）日本FP協会のCFP資格審査試験の全ての課目に合格したが認定されていない者</p>
<p class="txtBold">3）金融財政事情研究会実施の１級FP技能検定 学科試験の一部合格者</p>
<p class="txtBold">4）1級FP技能検定合格者</p>
<p class="txtBold">5）金融財政事情研究会実施の普通職業訓練短期課程金融実務科FP養成コースを修了した者で1年以上の実務経験を有する者</p>
</div>
<h2 id="Section08" class="cmnH2">受検手数料</h2>
<div class="cmnSection">
<p>1）受検手数料は、20,000円（非課税）です（支払手数料は別途ご負担ください）。</p>
</div>"""


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
    academic = next(item for item in candidates if item.fact_key == "exam_dates" and item.exam_level_id == "fp:2" and item.exam_component == "academic" and item.exam_year == 2026)
    assert academic.normalized_value.startswith("2026-04-01,2026-04-30")
    assert academic.normalized_value.endswith("2027-03-01,2027-03-24")
    assert len(academic.normalized_value.split(",")) == 24


def test_jafp_schedule_reads_both_years_and_tags_each_fact_with_its_year():
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:fp:jafp-schedule", JAFP_SCHEDULE_HTML, synthetic=False
    ))
    assert not issues
    cbt = [item for item in candidates if item.delivery_mode == "cbt"]
    assert {item.exam_year for item in cbt} == {2026, 2027}
    assert len([item for item in cbt if item.exam_year == 2026]) == 12
    assert len([item for item in cbt if item.exam_year == 2027]) == 12
    academic_2027 = next(item for item in cbt if item.exam_year == 2027 and item.fact_key == "exam_dates" and item.exam_level_id == "fp:2" and item.exam_component == "academic")
    assert len(academic_2027.normalized_value.split(",")) == 24
    assert academic_2027.normalized_value.startswith("2027-04-01,2027-04-30,2027-05-01,2027-05-22")
    assert academic_2027.normalized_value.endswith("2028-03-01,2028-03-24")
    result_2027 = next(item for item in cbt if item.exam_year == 2027 and item.fact_key == "result_date" and item.exam_level_id == "fp:2" and item.exam_component == "academic")
    assert result_2027.normalized_value == "2027-05-20,2027-06-15,2027-07-15,2027-08-17,2027-09-15,2027-10-18,2027-11-16,2027-12-15,2028-01-19,2028-02-16,2028-03-15,2028-04-17"


def test_jafp_1_practical_2027_stays_date_only_and_skips_conflicting_2026():
    candidates, issues = extract_candidates(snapshot_from_html(
        "source:fp:jafp-schedule", JAFP_SCHEDULE_HTML, synthetic=False
    ))
    assert not issues
    level1 = [item for item in candidates if item.exam_level_id == "fp:1"]
    # The 2026 row's 合格発表日 conflicts with the approved kinzai fact and
    # must not stage until the owner reconciles the two providers.
    assert {item.exam_year for item in level1} == {2027}
    by_key = {item.fact_key: item for item in level1}
    assert set(by_key) == {"exam_dates", "exam_schedule", "application_open", "application_deadline", "result_date"}
    assert all(item.provider_id == "jafp" and item.exam_component == "practical:asset-design" and item.delivery_mode == "pbt" for item in level1)
    assert by_key["exam_dates"].normalized_value == "2027-09-12"
    assert by_key["application_open"].normalized_value == "2027-07-15"
    assert by_key["application_deadline"].normalized_value == "2027-08-05"
    assert by_key["result_date"].normalized_value == "2027-11-02"
    # The page prints no reception clock times; none may be invented.
    assert all("T" not in item.normalized_value for item in level1)


def test_jafp_1_outline_fills_the_seven_missing_pbt_fields():
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:jafp-1-outline", JAFP_1_OUTLINE_HTML, synthetic=False)
    )
    assert not issues
    assert len(candidates) == 7
    by_key = {item.fact_key: item for item in candidates}
    assert set(by_key) == {"exam_method", "exam_time", "question_count", "question_format", "passing_standard", "eligibility", "fee"}
    assert all(
        item.provider_id == "jafp" and item.exam_level_id == "fp:1"
        and item.exam_component == "practical:asset-design" and item.delivery_mode == "pbt"
        and item.exam_year == 2026
        for item in candidates
    )
    assert by_key["exam_method"].normalized_value == "PBT"
    assert by_key["exam_time"].normalized_value == "120"
    assert by_key["question_count"].normalized_value == "20"
    assert by_key["question_count"].display_value == "2題（20問）"
    assert by_key["question_format"].normalized_value == "筆記（記述式）"
    assert by_key["passing_standard"].normalized_value == "60点以上（100点満点）"
    assert by_key["fee"].normalized_value == "20000"
    assert by_key["fee"].display_value == "20,000円（非課税）"
    eligibility = by_key["eligibility"].normalized_value
    assert eligibility.startswith("下記1）～5）のいずれかに該当する者 / 1）")
    assert "5）金融財政事情研究会実施の普通職業訓練短期課程" in eligibility
    # ※ annotations are notes, not eligibility requirements.
    assert "※退会" not in eligibility


def test_jafp_1_outline_fails_safe_without_the_yoko_heading():
    html = JAFP_1_OUTLINE_HTML.replace('<p class="txtBold txtBlue">2026年9月　1級FP技能検定試験要綱</p>', "")
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:jafp-1-outline", html, synthetic=False)
    )
    assert candidates == []
    assert issues[0].code == "structure_changed"


def test_captured_jafp_1_outline_snapshot_reads_all_seven_fields():
    path = Path("var/official-snapshots/fp/jafp-1-outline.html")
    if not path.exists():
        return
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fp:jafp-1-outline", path.read_text(encoding="utf-8"), synthetic=False)
    )
    assert not issues
    assert len(candidates) == 7
    assert {item.fact_key for item in candidates} == {"exam_method", "exam_time", "question_count", "question_format", "passing_standard", "eligibility", "fee"}


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
