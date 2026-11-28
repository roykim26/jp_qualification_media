"""Minimal 試験要綱 PDF extraction for the IRT scoring rule.

Only the sentence that names the exams using IRT is read.  Everything else in
the PDF stays out of facts until a dedicated extractor exists.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import re

from pypdf import PdfReader

from collector.fundamental_it import (
    FundamentalITFactCandidate,
    FundamentalITParseIssue,
)
from collector.it_passport import ITPassportFactCandidate, ITPassportParseIssue


SOURCE_ID = "source:fundamental-it:youkou-pdf"
IT_PASSPORT_SOURCE_ID = "source:it-passport:youkou-pdf"

IRT_RULE = re.compile(
    r"基本情報技術者試験においてはIRT（ItemResponseTheory：項目応答理論）に基づいて解答結果から評価点を算出する。"
)
# The same official sentence names IT Passport first; keep that whole clause as
# evidence instead of borrowing the Fundamental IT wording.
IT_PASSPORT_IRT_RULE = re.compile(
    r"（1）採点方式については，ITパスポート試験[^。]*項目応答理論）に基づいて解答結果から評価点を算出する。"
)


@dataclass(frozen=True)
class YoukouPdfSnapshot:
    source_id: str
    content_hash: str
    text: str
    synthetic: bool = True


def snapshot_from_pdf(
    pdf_bytes: bytes,
    *,
    source_id: str = SOURCE_ID,
    synthetic: bool = True,
) -> YoukouPdfSnapshot:
    if not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("youkou snapshot must be a PDF file")
    reader = PdfReader(BytesIO(pdf_bytes))
    text = "".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        raise ValueError("youkou PDF contains no extractable text")
    return YoukouPdfSnapshot(
        source_id, sha256(pdf_bytes).hexdigest(), text, synthetic
    )


def extract_candidates(
    snapshot: YoukouPdfSnapshot,
) -> tuple[list[FundamentalITFactCandidate], tuple[FundamentalITParseIssue, ...]]:
    normalized = re.sub(r"\s+", "", snapshot.text)
    match = IRT_RULE.search(normalized)
    if not match:
        return [], (
            FundamentalITParseIssue(
                "structure_changed", "IRT scoring statement not found"
            ),
        )
    return [
        FundamentalITFactCandidate(
            "scoring_method",
            "IRT",
            "IRT（項目応答理論）",
            snapshot.source_id,
            snapshot.content_hash,
            risk_level="medium",
            synthetic=snapshot.synthetic,
            evidence_text=match.group(0),
            value_type="text",
        )
    ], ()


def extract_it_passport_candidates(
    snapshot: YoukouPdfSnapshot,
) -> tuple[list[ITPassportFactCandidate], tuple[ITPassportParseIssue, ...]]:
    """Read the IT Passport IRT sentence from the shared 試験要綱 PDF."""
    normalized = re.sub(r"\s+", "", snapshot.text)
    match = IT_PASSPORT_IRT_RULE.search(normalized)
    if not match:
        return [], (
            ITPassportParseIssue(
                "structure_changed", "IT Passport IRT statement not found"
            ),
        )
    return [
        ITPassportFactCandidate(
            fact_key="scoring_method",
            normalized_value="IRT",
            display_value="IRT（項目応答理論）",
            source_id=snapshot.source_id,
            source_snapshot_id=snapshot.content_hash,
            risk_level="medium",
            synthetic=snapshot.synthetic,
            evidence_text=match.group(0),
            value_type="text",
        )
    ], ()
