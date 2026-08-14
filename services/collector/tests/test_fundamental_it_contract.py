from collector.fundamental_it import (
    extract_candidates,
    is_registered_source_url,
    snapshot_from_html,
    source_plan,
)


def test_fundamental_it_source_plan_is_explicit_and_https_only():
    assert {item["id"] for item in source_plan()} == {
        "source:fundamental-it:exam",
        "source:fundamental-it:cbt",
        "source:fundamental-it:syllabus",
    }
    assert all(item["canonical_url"].startswith("https://") for item in source_plan())


def test_fundamental_it_source_boundary_rejects_unregistered_hosts():
    assert is_registered_source_url("https://www.ipa.go.jp/shiken/kubun/fe.html")
    assert not is_registered_source_url("http://www.ipa.go.jp/shiken/kubun/fe.html")
    assert not is_registered_source_url("https://example.com/fe.html")


def test_fundamental_it_extracts_declared_fields_without_inference():
    snapshot = snapshot_from_html(
        "source:fundamental-it:cbt",
        '<p data-fact-key="exam_method">CBT方式</p><p data-fact-key="exam_schedule">随時実施</p>',
        synthetic=False,
    )
    candidates, issues = extract_candidates(snapshot)
    assert not issues
    assert [candidate.fact_key for candidate in candidates] == ["exam_method", "exam_schedule"]
    assert all(candidate.synthetic is False for candidate in candidates)


def test_fundamental_it_does_not_infer_from_ipa_prose():
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:exam", "<p>CBT方式により随時実施</p>")
    )
    assert candidates == []
    assert issues[0].code == "structure_changed"


def test_fundamental_it_exam_page_extracts_subject_formats_and_counts():
    html = """<main>
    <div class="def-list --side"><dt>実施方式・実施時期</dt><dd>CBT方式により随時実施</dd></div>
    <h4>科目A</h4><div><div class="def-list --side"><dt>試験時間</dt><dd>90分</dd></div><div class="def-list --side"><dt>出題形式</dt><dd>多肢選択式（四肢択一）</dd></div><div class="def-list --side"><dt>出題数・解答数</dt><dd>出題数：60問 解答数：60問</dd></div></div>
    <h4>科目B</h4><div><div class="def-list --side"><dt>試験時間</dt><dd>100分</dd></div><div class="def-list --side"><dt>出題形式</dt><dd>多肢選択式</dd></div><div class="def-list --side"><dt>出題数・解答数</dt><dd>出題数：20問 解答数：20問</dd></div></div>
    </main>"""
    candidates, issues = extract_candidates(snapshot_from_html("source:fundamental-it:exam", html, synthetic=False))
    assert not issues
    by_key = {candidate.fact_key: candidate for candidate in candidates}
    assert by_key["exam_method"].normalized_value == "CBT"
    assert by_key["exam_subject_a_time"].normalized_value == "90"
    assert by_key["exam_subject_b_time"].normalized_value == "100"
    assert by_key["exam_subject_a_question_count"].normalized_value == "60"
    assert by_key["exam_subject_b_answer_count"].normalized_value == "20"
