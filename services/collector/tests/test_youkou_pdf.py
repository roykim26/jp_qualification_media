from collector.youkou_pdf import (
    SOURCE_ID,
    YoukouPdfSnapshot,
    extract_candidates,
    snapshot_from_pdf,
)

IRT_TEXT = """
4. 採点方式・配点・合格基準
（1）採点方式については，IT パスポート試験，情報セキュリティマネジメント試験及び基本情報技
術者試験においては IRT（Item Response Theory：項目応答理論）に基づいて解答結果から評価
点を算出する。それ以外の試験区分・科目においては素点方式を採用する。
"""


def test_youkou_pdf_snapshot_requires_pdf_bytes():
    try:
        snapshot_from_pdf(b"<html>not a pdf</html>")
    except ValueError as error:
        assert "PDF" in str(error)
    else:
        raise AssertionError("non-PDF bytes must be rejected")


def test_youkou_pdf_extracts_fe_irt_statement():
    snapshot = YoukouPdfSnapshot(
        SOURCE_ID,
        "e191898aadf48b4d707cd443c3be7e32e3b586705595bcac6507645fbbe24ae4",
        IRT_TEXT,
        synthetic=False,
    )
    candidates, issues = extract_candidates(snapshot)
    assert not issues
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.fact_key == "scoring_method"
    assert candidate.normalized_value == "IRT"
    assert candidate.value_type == "text"
    assert candidate.risk_level == "medium"
    assert candidate.delivery_mode == "cbt"
    assert candidate.source_id == SOURCE_ID
    assert candidate.synthetic is False
    assert "基本情報技術者試験においてはIRT" in candidate.evidence_text


def test_youkou_pdf_without_irt_statement_reports_structure_changed():
    snapshot = YoukouPdfSnapshot(SOURCE_ID, "hash", "採点方式は素点方式とする。")
    candidates, issues = extract_candidates(snapshot)
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]
