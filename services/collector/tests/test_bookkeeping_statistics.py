import pytest

from collector.bookkeeping import extract_candidates, snapshot_from_html
from collector.ingest_bookkeeping import candidate_id, value_key

UNIFIED_HTML = """
<h2>2級受験者データ（統一試験）</h2>
<table>
<tr><th>回</th><th>受験者数 (申込者数)</th><th>実受験者数</th><th>合格者数</th><th>合格率</th></tr>
<tr><td>173(2026.06.14)</td><td>5,724名</td><td>4,821名</td><td>728名</td><td>15.1%</td></tr>
<tr><td>172（2026.02.22）</td><td>7,115名</td><td>6,038名</td><td>911名</td><td>15.1％</td></tr>
<tr><td>155（2020.6.14）</td><td>中止</td></tr>
<tr><td>124（Ｈ22.2.28）</td><td>919名</td><td>725名</td><td>304名</td><td>41.9%</td></tr>
</table>
"""

NET_HTML = """
<h2>２級・３級受験者データ（ネット試験）</h2>
<p>2020年12月に開始した日商簿記検定試験2級・3級ネット試験の受験者データは、以下のとおりです。
※2021年度から、統一試験、団体試験（ペーパー試験）、ネット試験方式で施行しております。
試験問題について、3方式いずれも出題範囲や問題の難易度は同じです（新たな日商簿記検定のイメージをご参照ください）。</p>
<h2>2級</h2>
<table>
<tr><th>期間</th><th>受験者数</th><th>合格者数</th><th>合格率</th></tr>
<tr><td>2026年4月～2026年6月</td><td>33,659名</td><td>10,749名</td><td>31.9%</td></tr>
<tr><td>2025年4月～2026年3月</td><td>141,072名</td><td>46,351名</td><td>32.9％</td></tr>
</table>
<h2>3級</h2>
<table>
<tr><th>期間</th><th>受験者数</th><th>合格者数</th><th>合格率</th></tr>
<tr><td>2025年4月～2026年3月</td><td>276,477名</td><td>112,797名</td><td>40.8%</td></tr>
</table>
"""

# data_class4 prints the live 簿記初級 期間 block above the retired 4級 回 block,
# with a second header row in the middle of the same table.
MIXED_HTML = """
<h2>簿記初級、4級受験者データ</h2>
<table>
<tr><th>期間</th><th>受験者数</th><th>合格者数</th><th>合格率</th></tr>
<tr><td>2026年4月1日～2026年6月30日</td><td>741名</td><td>454名</td><td>61.3%</td></tr>
<tr><th>回</th><th>受験者数 (申込者数)</th><th>実受験者数</th><th>合格者数</th><th>合格率</th></tr>
<tr><td>131（2012.6.10）</td><td>911名</td><td>793名</td><td>357名</td><td>45.0%</td></tr>
</table>
"""


def _snapshot(source_id, html):
    return snapshot_from_html(source_id, html, synthetic=False)


def test_unified_history_rows_carry_their_own_year_and_session():
    candidates, issues = extract_candidates(
        _snapshot("source:bookkeeping:candidate-data-class2", UNIFIED_HTML)
    )

    assert not issues
    rows = {}
    for c in candidates:
        if c.exam_session:
            rows.setdefault(c.exam_session, {})[c.fact_key] = c
    assert set(rows) == {"173", "172", "124"}
    assert rows["173"]["applicants"].normalized_value == "5724"
    assert rows["173"]["applicants"].exam_year == 2026
    assert rows["173"]["applicants"].value_type == "integer"
    assert rows["173"]["pass_rate"].normalized_value == "15.1"
    assert rows["173"]["pass_rate"].value_type == "decimal"
    # 半角括号、全角括号与平成年号写法都必须落到同一个回合身份上。
    assert rows["172"]["examinees"].exam_year == 2026
    assert rows["172"]["pass_rate"].normalized_value == "15.1"
    assert rows["124"]["passed"].exam_year == 2010


def test_cancelled_session_records_no_number_and_no_structural_failure():
    candidates, issues = extract_candidates(
        _snapshot("source:bookkeeping:candidate-data-class2", UNIFIED_HTML)
    )

    assert not issues
    assert "155" not in {c.exam_session for c in candidates if c.exam_session}
    assert not [c for c in candidates if "155" in c.display_value]


def test_two_sessions_in_one_year_stay_distinct_end_to_end():
    candidates, _ = extract_candidates(
        _snapshot("source:bookkeeping:candidate-data-class2", UNIFIED_HTML)
    )
    pair = [c for c in candidates if c.fact_key == "applicants" and c.exam_year == 2026]
    assert len(pair) == 2

    ids = set()
    keys = set()
    for c in pair:
        ids.add(
            candidate_id(
                "h" * 64, c.exam_level_id, c.delivery_mode, c.fact_key, "digest", c.exam_session
            )
        )
        keys.add(
            value_key(c.fact_key, c.exam_level_id, c.delivery_mode, c.exam_session, c.exam_year, c.normalized_value, c.display_value)
        )
    # 两条 2026 年的 applicants 事实合格者数相同，只有回合号能把它们分开。
    assert len(ids) == len(keys) == 2


def test_candidate_id_without_a_session_keeps_the_recorded_shape():
    legacy = candidate_id("a" * 64, "bookkeeping:1", "unified", "exam_time", "a32bf7757c95")

    assert legacy == f"candidate:bookkeeping:{'a' * 64}:bookkeeping:1:unified:exam_time:a32bf7757c95"
    assert candidate_id("a" * 64, "bookkeeping:1", "unified", "applicants", "d" * 12, "173").count(":") == legacy.count(":") + 1


def test_net_history_maps_only_the_columns_the_page_actually_labels():
    candidates, issues = extract_candidates(
        _snapshot("source:bookkeeping:candidate-data-class23-net", NET_HTML)
    )

    assert not issues
    net = [c for c in candidates if c.delivery_mode == "network" and c.fact_key != "statistics_methodology"]
    assert {c.fact_key for c in net} == {"passed", "pass_rate"}
    assert not [c for c in net if c.fact_key in {"applicants", "examinees"}]
    assert all(c.exam_session is None for c in net)
    assert {c.exam_year for c in net} == {2026, 2025}


def test_net_history_separates_the_two_levels_by_heading():
    candidates, _ = extract_candidates(
        _snapshot("source:bookkeeping:candidate-data-class23-net", NET_HTML)
    )
    by_level = {}
    for c in candidates:
        if c.fact_key == "passed":
            by_level.setdefault(c.exam_level_id, set()).add(c.normalized_value)

    assert by_level == {"bookkeeping:2": {"10749", "46351"}, "bookkeeping:3": {"112797"}}
    assert all(c.delivery_mode == "network" for c in candidates if c.fact_key == "passed")


def test_statistics_methodology_keeps_only_official_printed_wording():
    unified, _ = extract_candidates(_snapshot("source:bookkeeping:candidate-data-class2", UNIFIED_HTML))
    net, _ = extract_candidates(_snapshot("source:bookkeeping:candidate-data-class23-net", NET_HTML))

    notes = [c for c in unified + net if c.fact_key == "statistics_methodology"]
    assert all(c.value_type == "text" for c in notes)
    assert all(c.exam_year is None and c.exam_session is None for c in notes)
    headers = [c.normalized_value for c in notes if c.normalized_value.startswith(("回/", "期間/"))]
    assert set(headers) == {"回/受験者数 (申込者数)/実受験者数/合格者数/合格率", "期間/受験者数/合格者数/合格率"}
    assert len(headers) == 3  # 2級統一 plus 2級・3級ネット, one note per declared series
    scope = [c.normalized_value for c in notes if "3方式いずれも" in c.normalized_value]
    assert len(scope) == 2
    assert all(s.startswith("2020年12月に開始した") for s in scope)


def test_no_methodology_note_ever_states_a_derived_denominator():
    candidates, _ = extract_candidates(_snapshot("source:bookkeeping:candidate-data-class2", UNIFIED_HTML))
    net_candidates, _ = extract_candidates(_snapshot("source:bookkeeping:candidate-data-class23-net", NET_HTML))

    for c in candidates + net_candidates:
        if c.fact_key == "statistics_methodology":
            # 合格率の分母はどのページにも成文されていない。演算式を官方の言い回しとして
            # 登録することは鉄律 1 に反する。
            assert not any(token in c.normalized_value for token in ("÷", "=", "×100", "で割る", "で除す"))


@pytest.mark.parametrize("source_id", ["source:bookkeeping:candidate-data-class4", "source:bookkeeping:candidate-data-costing"])
def test_levels_outside_the_contract_still_produce_nothing(source_id):
    html = MIXED_HTML if source_id.endswith("class4") else """
    <table>
    <tr><th>期間</th><th>受験者数</th><th>合格者数</th><th>合格率</th></tr>
    <tr><td>2026年4月1日～2026年6月30日</td><td>269名</td><td>237名</td><td>88.1%</td></tr>
    </table>"""
    candidates, issues = extract_candidates(_snapshot(source_id, html))

    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_unparsable_statistics_row_is_refused_instead_of_guessed():
    html = """
    <table>
    <tr><th>回</th><th>受験者数 (申込者数)</th><th>実受験者数</th><th>合格者数</th><th>合格率</th></tr>
    <tr><td>173(2026.06.14)</td><td>約5,700名</td><td>4,821名</td><td>728名</td><td>15.1%</td></tr>
    </table>"""
    candidates, issues = extract_candidates(
        _snapshot("source:bookkeeping:candidate-data-class2", html)
    )

    assert [c.fact_key for c in candidates] == ["statistics_methodology"]
    assert [issue.code for issue in issues] == ["unparsed_statistics_row"]
