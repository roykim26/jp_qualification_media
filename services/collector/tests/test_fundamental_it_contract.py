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
