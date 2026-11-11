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


SOURCE_ID = "source:fundamental-it:youkou-pdf"

IRT_RULE = re.compile(
    r"基本情報技術者試験においてはIRT（ItemResponseTheory：項目応答理論）に基づいて解答結果から評価点を算出する。"
)


@dataclass(frozen=True)
class YoukouPdfSnapshot:
    source_id: str
    content_hash: str
    text: str
    synthetic: bool = True


def snapshot_from_pdf(pdf_bytes: bytes, *, synthetic: bool = True) -> YoukouPdfSnapshot:
    if not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("youkou snapshot must be a PDF file")
    reader = PdfReader(BytesIO(pdf_bytes))
    text = "".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        raise ValueError("youkou PDF contains no extractable text")
    return YoukouPdfSnapshot(
        SOURCE_ID, sha256(pdf_bytes).hexdigest(), text, synthetic
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
