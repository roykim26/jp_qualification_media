import json
from hashlib import sha256
from pathlib import Path

import collector.ingest_fundamental_it as ingest_module
from collector.fundamental_it import (
    extract_candidates,
    is_registered_source_url,
    snapshot_from_html,
    source_plan,
)
from collector.ingest_fundamental_it import capture_record


def test_fundamental_it_capture_record_requires_reported_raw_hash(monkeypatch, tmp_path: Path):
    snapshot = tmp_path / "snapshot.html"
    snapshot.write_bytes(b"official bytes")
    content_hash = sha256(snapshot.read_bytes()).hexdigest()
    (tmp_path / "capture-report.json").write_text(
        json.dumps(
            {"results": [{"source_id": "source:fundamental-it:exam", "content_hash": content_hash,
                          "status": "ok", "status_code": 200, "captured_at": "2026-09-23T02:08:01+00:00",
                          "url": "https://www.ipa.go.jp/shiken/kubun/fe.html", "snapshot_path": str(snapshot)}]}
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(ingest_module, "SNAPSHOT_ROOT", tmp_path)

    assert capture_record("source:fundamental-it:exam", snapshot)["status_code"] == 200
    snapshot.write_bytes(b"tampered bytes")
    try:
        capture_record("source:fundamental-it:exam", snapshot)
    except ValueError as error:
        assert "raw snapshot hash" in str(error)
    else:
        raise AssertionError("raw snapshot hash must be verified")


def test_fundamental_it_source_plan_is_explicit_and_https_only():
    assert {item["id"] for item in source_plan()} == {
        "source:fundamental-it:exam",
        "source:fundamental-it:cbt",
        "source:fundamental-it:syllabus",
        "source:fundamental-it:statistics-fe",
        "source:fundamental-it:ipa-fee",
        "source:fundamental-it:cbt-s",
        "source:fundamental-it:youkou-pdf",
    }
    assert all(item["canonical_url"].startswith("https://") for item in source_plan())


def test_statistics_page_yields_no_fabricated_candidates():
    snapshot = snapshot_from_html(
        "source:fundamental-it:statistics-fe",
        "<html><body><h2>統計情報（基本情報技術者試験）</h2></body></html>",
    )
    candidates, issues = extract_candidates(snapshot)

    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_fundamental_it_source_boundary_rejects_unregistered_hosts():
    assert is_registered_source_url("https://www.ipa.go.jp/shiken/kubun/fe.html")
    assert is_registered_source_url(
        "https://www.ipa.go.jp/shiken/mousikomi/schedule.html"
    )
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


def test_fundamental_it_cbt_page_extracts_only_unambiguous_delivery_fields():
    html = """<main>
    <p>情報セキュリティマネジメント試験（SG）、基本情報技術者試験（FE）は、CBT（Computer Based Testing）方式により実施しています。</p>
    <p>令和5年度から年間を通じてCBT方式で随時試験を実施しています。</p>
    <h4>令和8年8月受験</h4><dl><dt>合格発表日</dt><dd>9月28日</dd></dl>
    </main>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:cbt", html, synthetic=False)
    )
    assert not issues
    assert [(item.fact_key, item.normalized_value) for item in candidates] == [
        ("exam_method", "CBT"),
        ("exam_schedule", "year_round"),
    ]
    assert all("合格発表" not in item.evidence_text for item in candidates)


def test_fundamental_it_cbt_page_extracts_planned_suspension_period():
    html = """<main>
    <p>情報セキュリティマネジメント試験（SG）、基本情報技術者試験（FE）は、CBT（Computer Based Testing）方式により実施しています。</p>
    <p>システムリプレースのため、2026年12月28日から試験実施を一時休止することとしています。一時休止後の試験再開は、2027年1月下旬を予定しています。</p>
    <p>令和5年度から年間を通じてCBT方式で随時試験を実施しています。</p>
    </main>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:cbt", html, synthetic=False)
    )
    assert not issues
    by_key = {candidate.fact_key: candidate for candidate in candidates}
    suspension = by_key["suspension_period"]
    assert suspension.normalized_value == {
        "startsOn": "2026-12-28",
        "resumesFrom": "2027-01-late",
    }
    assert suspension.display_value == "2026年12月28日～2027年1月下旬（予定）実施休止"
    assert suspension.value_type == "json"
    assert suspension.risk_level == "high"
    assert "2026年12月28日から試験実施を一時休止" in suspension.evidence_text
    assert "2027年1月下旬を予定" in suspension.evidence_text


def test_fundamental_it_suspension_period_keeps_month_part_unrounded():
    html = """<main>
    <p>情報セキュリティマネジメント試験（SG）、基本情報技術者試験（FE）は、CBT（Computer Based Testing）方式により実施しています。</p>
    <p>システムリプレースのため、2027年1月5日から試験実施を一時休止することとしています。一時休止後の試験再開は、2027年2月中旬を予定しています。</p>
    </main>"""
    candidates, _ = extract_candidates(
        snapshot_from_html("source:fundamental-it:cbt", html, synthetic=False)
    )
    by_key = {candidate.fact_key: candidate for candidate in candidates}
    assert by_key["suspension_period"].normalized_value == {
        "startsOn": "2027-01-05",
        "resumesFrom": "2027-02-mid",
    }


def test_fundamental_it_suspension_period_requires_both_sentences_and_planned_resume():
    base = """<main>
    <p>情報セキュリティマネジメント試験（SG）、基本情報技術者試験（FE）は、CBT（Computer Based Testing）方式により実施しています。</p>
    <p>令和5年度から年間を通じてCBT方式で随時試験を実施しています。</p>
    %s
    </main>"""
    without_planned_resume = base % (
        "<p>システムリプレースのため、2026年12月28日から試験実施を一時休止することとしています。一時休止後の試験再開は、2027年1月下旬としています。</p>"
    )
    without_resume_sentence = base % (
        "<p>システムリプレースのため、2026年12月28日から試験実施を一時休止することとしています。</p>"
    )
    for html in (without_planned_resume, without_resume_sentence):
        candidates, _ = extract_candidates(
            snapshot_from_html("source:fundamental-it:cbt", html, synthetic=False)
        )
        assert [candidate.fact_key for candidate in candidates] == [
            "exam_method",
            "exam_schedule",
        ]


def test_fundamental_it_fee_page_uses_category_level_amount():
    html = """<html><head><title>スケジュール、手数料など | 試験情報 | IPA</title></head><body>
    <p>合格発表日、合格証書発送日などはこちらをご覧ください。</p>
    <p>受験手数料 7,500円（情報処理技術者試験は消費税込み。情報処理安全確保支援士試験は非課税。）です。</p>
    </body></html>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:ipa-fee", html, synthetic=False)
    )
    assert not issues
    assert [
        (candidate.fact_key, candidate.normalized_value, candidate.value_type)
        for candidate in candidates
    ] == [("fee", "7500", "integer")]
    assert candidates[0].risk_level == "high"
    assert candidates[0].status == "pending_review"
    assert candidates[0].synthetic is False
    assert "受験手数料" in candidates[0].evidence_text


def test_fundamental_it_fee_page_without_amount_yields_no_candidate():
    candidates, issues = extract_candidates(
        snapshot_from_html(
            "source:fundamental-it:ipa-fee",
            "<html><head><title>スケジュール、手数料など | IPA</title></head><body><p>手数料は改定されました。</p></body></html>",
            synthetic=False,
        )
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_fundamental_it_cbt_s_page_reads_eligibility_and_pass_criteria():
    html = """<html><head><title>【CBT】基本情報技術者試験（FE） | CBT-Solutions</title></head><body>
    <table><tr><th>試験区分</th><td>■基本情報技術者試験（FE）</td></tr>
    <tr><th>受験資格</th><td>どなたでも受験可能</td></tr>
    <tr><th>合格基準</th><td>各科目の評価点が基準点（600点）以上の場合に合格です。</td></tr></table>
    </body></html>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:cbt-s", html, synthetic=False)
    )
    assert not issues
    by_key = {candidate.fact_key: candidate for candidate in candidates}
    assert by_key["eligibility"].normalized_value == "どなたでも受験可能"
    assert by_key["eligibility"].risk_level == "high"
    assert by_key["passing_standard"].normalized_value == "各科目の評価点が基準点（600点）以上"
    assert by_key["passing_standard"].risk_level == "high"
    assert "600点" in by_key["passing_standard"].evidence_text


def test_fundamental_it_cbt_s_page_rejects_other_exams_and_missing_rows():
    other = """<html><head><title>【CBT】情報セキュリティマネジメント試験（SG）</title></head><body>
    <table><tr><th>受験資格</th><td>どなたでも受験可能</td></tr></table></body></html>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:cbt-s", other, synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]

    missing = """<html><head><title>【CBT】基本情報技術者試験（FE）</title></head><body>
    <table><tr><th>受験資格</th><td>どなたでも受験可能</td></tr></table></body></html>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:cbt-s", missing, synthetic=False)
    )
    assert [candidate.fact_key for candidate in candidates] == ["eligibility"]


def test_fundamental_it_subject_facts_carry_cbt_component_dimensions():
    html = """<main>
    <div class="def-list --side"><dt>実施方式・実施時期</dt><dd>CBT方式により随時実施</dd></div>
    <h4>科目A</h4><div><div class="def-list --side"><dt>試験時間</dt><dd>90分</dd></div></div>
    <h4>科目B</h4><div><div class="def-list --side"><dt>試験時間</dt><dd>100分</dd></div></div>
    </main>"""
    candidates, issues = extract_candidates(
        snapshot_from_html("source:fundamental-it:exam", html, synthetic=False)
    )
    assert not issues
    by_key = {candidate.fact_key: candidate for candidate in candidates}
    assert by_key["exam_subject_a_time"].delivery_mode == "cbt"
    assert by_key["exam_subject_a_time"].exam_component == "subject-a"
    assert by_key["exam_subject_b_time"].exam_component == "subject-b"
    assert by_key["exam_method"].delivery_mode == "cbt"
    assert by_key["exam_method"].exam_component is None
