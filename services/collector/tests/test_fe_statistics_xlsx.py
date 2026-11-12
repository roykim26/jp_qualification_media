"""Work package J stage 2: real-byte offline lock for the FE 推移表 extractor.

The fixture is the byte-for-byte 202609 attachment captured on 2026-11-12
(sha256 2063cd07c857678bae6a55def10446de57828c33191d3e2e6a853370e698cf9f).
Owner decisions locked here: D1=A, D2 exam_year=fiscal start year, D3 first
batch 令和7年度 (2025), official printed pass rate only.
"""

from hashlib import sha256
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook

from collector.fe_statistics_xlsx import (
    SOURCE_ID,
    FeSuiihyoSnapshot,
    extract_candidates,
    snapshot_from_xlsx,
)


FIXTURE = Path(__file__).parent / "fixtures" / "fe" / "202609_fe_01_suiihyo.xlsx"
FIXTURE_SHA256 = "2063cd07c857678bae6a55def10446de57828c33191d3e2e6a853370e698cf9f"


def _real_bytes() -> bytes:
    return FIXTURE.read_bytes()


def _tampered(mutate) -> bytes:
    workbook = load_workbook(FIXTURE)
    mutate(workbook["ＦＥ"])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_fixture_is_the_captured_official_attachment():
    assert sha256(_real_bytes()).hexdigest() == FIXTURE_SHA256


def test_snapshot_requires_registered_source_and_zip_bytes():
    try:
        snapshot_from_xlsx("source:fundamental-it:unknown", _real_bytes())
    except ValueError as error:
        assert "unregistered" in str(error)
    else:
        raise AssertionError("unregistered source must be refused")
    try:
        snapshot_from_xlsx(SOURCE_ID, b"<html>not xlsx</html>")
    except ValueError as error:
        assert "xlsx" in str(error)
    else:
        raise AssertionError("non-zip bytes must be refused")
    snapshot = snapshot_from_xlsx(SOURCE_ID, _real_bytes(), synthetic=False)
    assert snapshot.content_hash == FIXTURE_SHA256
    assert snapshot.synthetic is False
    assert snapshot_from_xlsx(SOURCE_ID, _real_bytes()).synthetic is True


def test_real_bytes_extract_printed_annual_totals_for_complete_years():
    snapshot = snapshot_from_xlsx(SOURCE_ID, _real_bytes(), synthetic=False)
    candidates, issues = extract_candidates(snapshot)
    assert not issues
    # 令和5/6/7年度 are complete; 令和8年度 is in progress (4–9月 only) and
    # 累計 spans years — neither may emit annual facts.
    assert len(candidates) == 12
    assert sorted({c.exam_year for c in candidates}) == [2023, 2024, 2025]
    by_year = {}
    for candidate in candidates:
        by_year.setdefault(candidate.exam_year, {})[candidate.fact_key] = candidate
    reiwa7 = by_year[2025]
    assert reiwa7["applicants"].normalized_value == "172217"
    assert reiwa7["examinees"].normalized_value == "147186"
    assert reiwa7["passed"].normalized_value == "56370"
    assert reiwa7["pass_rate"].normalized_value == "38.3"
    assert reiwa7["pass_rate"].value_type == "decimal"
    assert reiwa7["applicants"].value_type == "integer"
    for candidate in candidates:
        assert candidate.risk_level == "high"
        assert candidate.delivery_mode == "cbt"
        assert candidate.synthetic is False
        assert candidate.source_id == SOURCE_ID
        assert candidate.source_snapshot_id == FIXTURE_SHA256
        assert "合格率（合格者数／受験者数：％）" in candidate.evidence_text
        assert "(令和8年10月21日現在)" in candidate.evidence_text


def test_pass_rate_evidence_pins_the_printed_cell():
    snapshot = snapshot_from_xlsx(SOURCE_ID, _real_bytes(), synthetic=False)
    candidates, _ = extract_candidates(snapshot)
    rate = next(c for c in candidates if c.exam_year == 2025 and c.fact_key == "pass_rate")
    assert "ＦＥ!AA12" in rate.evidence_text
    assert rate.display_value == "38.3%"
    applicants = next(c for c in candidates if c.exam_year == 2025 and c.fact_key == "applicants")
    assert "ＦＥ!Z10" in applicants.evidence_text


def test_float_artifacts_normalize_to_one_printed_decimal():
    # The workbook stores 40.799999999999997 for 令和6年度; the print is 40.8.
    snapshot = snapshot_from_xlsx(SOURCE_ID, _real_bytes(), synthetic=False)
    candidates, _ = extract_candidates(snapshot)
    rate = next(c for c in candidates if c.exam_year == 2024 and c.fact_key == "pass_rate")
    assert rate.normalized_value == "40.8"


def test_footer_formula_change_reports_structure_changed():
    def mutate(worksheet):
        worksheet.oddFooter.left.text = "（注）合格率の定義は改定されました。"

    candidates, issues = extract_candidates(
        snapshot_from_xlsx(SOURCE_ID, _tampered(mutate), synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_sheet_rename_reports_structure_changed():
    def mutate(worksheet):
        worksheet.title = "FE"

    candidates, issues = extract_candidates(
        snapshot_from_xlsx(SOURCE_ID, _tampered(mutate), synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_header_cutoff_removal_reports_structure_changed():
    def mutate(worksheet):
        worksheet.oddHeader.right.text = ""

    candidates, issues = extract_candidates(
        snapshot_from_xlsx(SOURCE_ID, _tampered(mutate), synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_month_layout_change_reports_structure_changed():
    def mutate(worksheet):
        worksheet["B1"] = "４月度"

    candidates, issues = extract_candidates(
        snapshot_from_xlsx(SOURCE_ID, _tampered(mutate), synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_all_years_in_progress_reports_structure_changed():
    def mutate(worksheet):
        for row in (4, 7, 10):  # clear one month of each complete year
            worksheet.cell(row=row, column=2).value = None

    candidates, issues = extract_candidates(
        snapshot_from_xlsx(SOURCE_ID, _tampered(mutate), synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]
    assert "no complete fiscal year" in issues[0].message


def test_duplicate_fiscal_year_label_reports_structure_changed():
    def mutate(worksheet):
        worksheet["A13"] = "令和５年度"

    candidates, issues = extract_candidates(
        snapshot_from_xlsx(SOURCE_ID, _tampered(mutate), synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_missing_annual_total_reports_structure_changed():
    def mutate(worksheet):
        worksheet["Z12"] = None

    candidates, issues = extract_candidates(
        snapshot_from_xlsx(SOURCE_ID, _tampered(mutate), synthetic=False)
    )
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]


def test_corrupt_zip_reports_structure_changed():
    raw = b"PK\x03\x04" + b"corrupt" * 100
    snapshot = FeSuiihyoSnapshot(SOURCE_ID, sha256(raw).hexdigest(), raw, synthetic=False)
    candidates, issues = extract_candidates(snapshot)
    assert candidates == []
    assert [issue.code for issue in issues] == ["structure_changed"]