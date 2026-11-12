"""Work package J: FE 推移表 xlsx extraction (owner decision D1=A).

Reads only the officially printed 年度合計 values of complete fiscal years.
Owner decisions: D2 exam_year = fiscal start year (令和7年度 → 2025), D3 first
batch = 令和7年度, D5 statistics_methodology comes from the index page instead
(see fundamental_it._extract_statistics_index_page).

Row semantics and the pass-rate denominator are anchored to the workbook's own
printed footer; the header anchors the table identity and data cutoff.  Any
structural drift yields structure_changed and no candidates — nothing is
inferred, and in-progress fiscal years (missing months) emit no annual facts.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import re
from unicodedata import normalize

from openpyxl import load_workbook

from collector.fundamental_it import (
    FUNDAMENTAL_IT_SOURCES,
    FundamentalITFactCandidate,
    FundamentalITParseIssue,
)


SOURCE_ID = "source:fundamental-it:statistics-fe-suiihyo"
SHEET_NAME = "ＦＥ"
TOTAL_LABEL = "年度合計"
CUMULATIVE_LABEL = "累計"
# Fiscal-year order: April first, March last.  Labels compare after NFKC
# folding, so the full-width print is stored but matched half-width.
MONTH_LABELS = tuple(
    normalize("NFKC", month)
    for month in (
        "４月", "５月", "６月", "７月", "８月", "９月",
        "１０月", "１１月", "１２月", "１月", "２月", "３月",
    )
)
REIWA_LABEL = re.compile(r"令和(\d+)年度")
REIWA_BASE_YEAR = 2018  # 令和1年度 = 2019
# Printed footer semantics (oddFooter): row order and the rate formulas.
FOOTER_ROW_ORDER = "応募者数、受験者数、合格者数"
FOOTER_PASS_RATE_FORMULA = "合格率（合格者数／受験者数：％）"
HEADER_TITLE_ANCHORS = ("基本情報技術者試験", "推移表")
HEADER_CUTOFF = re.compile(r"\(令和\d+年\d+月\d+日現在\)")
ROW_MEANINGS = ("応募者数", "受験者数", "合格者数")


def _printed(value: object) -> str:
    """NFKC-fold and strip whitespace so full-width print compares reliably."""
    return re.sub(r"\s+", "", normalize("NFKC", str(value)))


@dataclass(frozen=True)
class FeSuiihyoSnapshot:
    source_id: str
    content_hash: str
    raw: bytes
    synthetic: bool = True


def snapshot_from_xlsx(source_id: str, raw: bytes, *, synthetic: bool = True) -> FeSuiihyoSnapshot:
    if source_id not in FUNDAMENTAL_IT_SOURCES:
        raise ValueError(f"unregistered Fundamental IT source: {source_id}")
    if not raw.startswith(b"PK\x03\x04"):
        raise ValueError("suiihyo snapshot must be an xlsx (zip) file")
    return FeSuiihyoSnapshot(source_id, sha256(raw).hexdigest(), raw, synthetic)


def _structure_changed(message: str) -> tuple[list[FundamentalITFactCandidate], tuple[FundamentalITParseIssue, ...]]:
    return [], (FundamentalITParseIssue("structure_changed", message),)


def _header_footer_text(worksheet) -> tuple[str, str]:
    def join(header) -> str:
        return "".join(
            part.text or "" for part in (header.left, header.center, header.right)
        )

    return _printed(join(worksheet.oddHeader)), _printed(join(worksheet.oddFooter))


def _month_columns(worksheet) -> list[int] | None:
    """Locate the 12 month count columns by their printed row-1 labels."""
    labels = {}
    for column in range(1, worksheet.max_column + 1):
        value = worksheet.cell(row=1, column=column).value
        if value is not None:
            labels.setdefault(_printed(value), column)
    total_column = labels.get(TOTAL_LABEL)
    if total_column is None:
        return None
    columns = []
    for month in MONTH_LABELS:
        column = labels.get(month)
        if column is None or column >= total_column:
            return None
        # Each month owns a merged count+rate pair; the rate half prints no label.
        if worksheet.cell(row=1, column=column + 1).value is not None:
            return None
        columns.append(column)
    if columns != sorted(columns):
        return None
    return columns


def _number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def extract_candidates(
    snapshot: FeSuiihyoSnapshot,
) -> tuple[list[FundamentalITFactCandidate], tuple[FundamentalITParseIssue, ...]]:
    try:
        workbook = load_workbook(BytesIO(snapshot.raw), data_only=True)
    except Exception:
        return _structure_changed("suiihyo workbook could not be parsed")
    if SHEET_NAME not in workbook.sheetnames:
        return _structure_changed(f"suiihyo sheet {SHEET_NAME!r} not found")
    worksheet = workbook[SHEET_NAME]

    header, footer = _header_footer_text(worksheet)
    if not all(anchor in header for anchor in HEADER_TITLE_ANCHORS):
        return _structure_changed("suiihyo header title anchors not found")
    cutoff = HEADER_CUTOFF.search(header)
    if not cutoff:
        return _structure_changed("suiihyo header data cutoff not found")
    if FOOTER_ROW_ORDER not in footer or _printed(FOOTER_PASS_RATE_FORMULA) not in footer:
        return _structure_changed("suiihyo footer row-order or pass-rate formula changed")

    month_columns = _month_columns(worksheet)
    if month_columns is None:
        return _structure_changed("suiihyo month/total header layout changed")
    total_column = None
    for column in range(1, worksheet.max_column + 1):
        if _printed(worksheet.cell(row=1, column=column).value or "") == TOTAL_LABEL:
            total_column = column
            break

    candidates: list[FundamentalITFactCandidate] = []
    seen_years: set[int] = set()
    found_label = False
    for row in range(2, worksheet.max_row + 1):
        label = _printed(worksheet.cell(row=row, column=1).value or "")
        if label == CUMULATIVE_LABEL:
            continue  # 累計 spans all years; it is not an annual fact.
        match = REIWA_LABEL.fullmatch(label)
        if not match:
            continue
        found_label = True
        printed_label = str(worksheet.cell(row=row, column=1).value).strip()
        exam_year = REIWA_BASE_YEAR + int(match.group(1))
        if exam_year in seen_years:
            return _structure_changed(f"duplicate fiscal year label: {printed_label}")
        seen_years.add(exam_year)
        if row + 2 > worksheet.max_row:
            return _structure_changed(f"fiscal year block truncated: {printed_label}")
        if worksheet.cell(row=row + 1, column=1).value or worksheet.cell(row=row + 2, column=1).value:
            return _structure_changed(f"fiscal year block is not three rows: {printed_label}")
        # An in-progress fiscal year prints only the months elapsed so far;
        # its partial 年度合計 is not an annual fact.
        if any(_number(worksheet.cell(row=row, column=column).value) is None for column in month_columns):
            continue
        values = [
            _number(worksheet.cell(row=row + offset, column=total_column).value)
            for offset in range(3)
        ]
        rate = _number(worksheet.cell(row=row + 2, column=total_column + 1).value)
        if any(value is None for value in values) or rate is None:
            return _structure_changed(f"annual totals missing for {printed_label}")
        applicants, examinees, passed = values
        if not (0 <= rate <= 100) or any(value < 0 or value != int(value) for value in values):
            return _structure_changed(f"annual totals out of range for {printed_label}")
        counts = (
            ("applicants", applicants, "integer"),
            ("examinees", examinees, "integer"),
            ("passed", passed, "integer"),
        )
        for offset, (fact_key, number, value_type) in enumerate(counts):
            cell = worksheet.cell(row=row + offset, column=total_column)
            display = f"{int(number):,}人"
            candidates.append(
                FundamentalITFactCandidate(
                    fact_key,
                    str(int(number)),
                    display,
                    snapshot.source_id,
                    snapshot.content_hash,
                    risk_level="high",
                    synthetic=snapshot.synthetic,
                    evidence_text=(
                        f"{SHEET_NAME}!{cell.coordinate} {printed_label} 年度合計 {ROW_MEANINGS[offset]}: {display}"
                        f" | 脚注: {FOOTER_PASS_RATE_FORMULA} | {cutoff.group(0)}"
                    ),
                    value_type=value_type,
                    exam_year=exam_year,
                )
            )
        rate_cell = worksheet.cell(row=row + 2, column=total_column + 1)
        rate_text = f"{round(rate, 1):.1f}"
        candidates.append(
            FundamentalITFactCandidate(
                "pass_rate",
                rate_text,
                f"{rate_text}%",
                snapshot.source_id,
                snapshot.content_hash,
                risk_level="high",
                synthetic=snapshot.synthetic,
                evidence_text=(
                    f"{SHEET_NAME}!{rate_cell.coordinate} {printed_label} 年度合計 合格率: {rate_text}%"
                    f" | 脚注: {FOOTER_PASS_RATE_FORMULA} | {cutoff.group(0)}"
                ),
                value_type="decimal",
                exam_year=exam_year,
            )
        )
    if not candidates:
        return _structure_changed(
            "no complete fiscal year found" if found_label else "no fiscal year labels found"
        )
    return candidates, ()