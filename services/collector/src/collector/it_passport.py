"""Offline-first IT Passport adapter for the registered official pages.

The adapter only accepts explicitly marked fields from a saved snapshot.  It
does not infer dates from prose, current time, or a page layout.  Live fetching
is still delegated to :class:`SafeFetcher` and remains outside this module's
write path.
"""

from dataclasses import dataclass
from hashlib import sha256
import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from collector.http_policy import SafeFetcher


IT_PASSPORT_SOURCES = {
    "source:it-passport:ipa-exam": {
        "canonical_url": "https://www.ipa.go.jp/shiken/",
        "allowed_domain": "www.ipa.go.jp",
    },
    "source:it-passport:jitec-home": {
        "canonical_url": "https://www3.jitec.ipa.go.jp/JitesCbt/",
        "allowed_domain": "www3.jitec.ipa.go.jp",
    },
    "source:it-passport:jitec-application": {
        "canonical_url": "https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html",
        "allowed_domain": "www3.jitec.ipa.go.jp",
    },
    # Shared 情報処理技術者試験 fee page.  It is registered per qualification so
    # the fee fact keeps its own provenance instead of borrowing another exam.
    "source:it-passport:ipa-fee": {
        "canonical_url": "https://www.ipa.go.jp/shiken/mousikomi/schedule.html",
        "allowed_domain": "www.ipa.go.jp",
    },
    # IT Passport exam structure (method, time, format, question count).
    "source:it-passport:ipa-exam-detail": {
        "canonical_url": "https://www.ipa.go.jp/shiken/kubun/ip.html",
        "allowed_domain": "www.ipa.go.jp",
    },
    # JITEC FAQ: eligibility, subject fields and pass criteria in official prose.
    "source:it-passport:jitec-faq": {
        "canonical_url": "https://www3.jitec.ipa.go.jp/JitesCbt/html/reference/faq.html",
        "allowed_domain": "www3.jitec.ipa.go.jp",
    },
}


def _normalize_digits(value: str) -> str:
    return value.translate(
        str.maketrans("０１２３４５６７８９（）", "0123456789()")
    )


@dataclass(frozen=True)
class ITPassportSnapshot:
    source_id: str
    content_hash: str
    html: str
    synthetic: bool = True


@dataclass(frozen=True)
class ITPassportFactCandidate:
    fact_key: str
    normalized_value: str
    display_value: str
    source_id: str
    source_snapshot_id: str
    risk_level: str
    status: str = "pending_review"
    synthetic: bool = True
    evidence_text: str | None = None
    value_type: str = "text"


@dataclass(frozen=True)
class ITPassportParseIssue:
    code: str
    message: str


def snapshot_from_html(
    source_id: str, html: str, *, synthetic: bool = True
) -> ITPassportSnapshot:
    if source_id not in IT_PASSPORT_SOURCES:
        raise ValueError(f"unregistered IT Passport source: {source_id}")
    if not html.strip():
        raise ValueError("snapshot HTML must not be empty")
    return ITPassportSnapshot(
        source_id=source_id,
        content_hash=sha256(html.encode("utf-8")).hexdigest(),
        html=html,
        synthetic=synthetic,
    )


def extract_declared_fields(
    snapshot: ITPassportSnapshot,
) -> tuple[dict[str, str], tuple[ITPassportParseIssue, ...]]:
    """Extract only ``data-fact-key`` fields with non-empty values.

    The marker is deliberately required for both fixture and future captured
    HTML.  A page with no markers is a structure failure, not an empty set of
    approved facts.
    """
    soup = BeautifulSoup(snapshot.html, "html.parser")
    fields: dict[str, str] = {}
    for node in soup.select("[data-fact-key]"):
        key = node.get("data-fact-key", "").strip()
        value = node.get_text(" ", strip=True)
        if key and value:
            fields[key] = value
    if not fields:
        return {}, (
            ITPassportParseIssue(
                "structure_changed", "no explicitly declared fact fields found"
            ),
        )
    return fields, ()


def extract_candidates(
    snapshot: ITPassportSnapshot,
) -> tuple[list[ITPassportFactCandidate], tuple[ITPassportParseIssue, ...]]:
    fields, issues = extract_declared_fields(snapshot)
    if issues:
        return [], issues
    high_risk = {"application_rule", "exam_date", "application_deadline", "fee"}
    candidates = [
        ITPassportFactCandidate(
            fact_key=key,
            normalized_value=value,
            display_value=value,
            source_id=snapshot.source_id,
            source_snapshot_id=snapshot.content_hash,
            risk_level="high" if key in high_risk else "medium",
            synthetic=snapshot.synthetic,
        )
        for key, value in fields.items()
    ]
    return candidates, ()


def diff_declared_fields(
    previous: ITPassportSnapshot, current: ITPassportSnapshot
) -> tuple[dict[str, tuple[str | None, str | None]], tuple[ITPassportParseIssue, ...]]:
    """Return field-level changes; layout-only changes remain non-facts."""
    previous_fields, previous_issues = extract_declared_fields(previous)
    current_fields, current_issues = extract_declared_fields(current)
    issues = previous_issues + current_issues
    if issues:
        return {}, issues
    keys = previous_fields.keys() | current_fields.keys()
    return {
        key: (previous_fields.get(key), current_fields.get(key))
        for key in keys
        if previous_fields.get(key) != current_fields.get(key)
    }, ()


def fetch_it_passport_snapshot(
    fetcher: SafeFetcher, source_id: str
) -> ITPassportSnapshot | None:
    source = IT_PASSPORT_SOURCES.get(source_id)
    if source is None:
        raise ValueError(f"unregistered IT Passport source: {source_id}")
    result = fetcher.fetch(source["canonical_url"])
    if result.status not in {"ok", "not_modified"} or result.body is None:
        return None
    return snapshot_from_html(
        source_id,
        result.body.decode("utf-8", errors="strict"),
        synthetic=False,
    )


def _sentence_at(text: str, index: int) -> str:
    left = text.rfind("。", 0, index) + 1
    right = text.find("。", index)
    if right == -1:
        return text[left:].strip()
    return text[left:right + 1].strip()


def _candidate(
    snapshot: ITPassportSnapshot,
    fact_key: str,
    normalized_value: str,
    display_value: str,
    evidence_text: str,
    *,
    risk_level: str,
    value_type: str = "text",
) -> ITPassportFactCandidate:
    return ITPassportFactCandidate(
        fact_key=fact_key,
        normalized_value=normalized_value,
        display_value=display_value,
        source_id=snapshot.source_id,
        source_snapshot_id=snapshot.content_hash,
        risk_level=risk_level,
        synthetic=snapshot.synthetic,
        evidence_text=evidence_text,
        value_type=value_type,
    )


def _extract_fee_page(
    snapshot: ITPassportSnapshot, title: str, text: str
) -> tuple[list[ITPassportFactCandidate], tuple[ITPassportParseIssue, ...]]:
    """Read the shared 情報処理技術者試験 fee statement.

    The page is shared by every 情報処理技術者試験, so the statement is the
    category-level 7,500円 rule (tax included); it is not an IT-Passport-only
    number inferred from another page.
    """
    if "スケジュール" not in title:
        return [], (
            ITPassportParseIssue(
                "structure_changed", "IPA schedule page title was not recognized"
            ),
        )
    match = re.search(r"受験手数料\s*7,500円\([^)]*\)", text)
    if not match:
        return [], (
            ITPassportParseIssue(
                "target_fields_missing",
                "fee page contained no explicit 7,500円 statement",
            ),
        )
    evidence = match.group(0)
    return [
        _candidate(
            snapshot,
            "fee",
            "7500",
            "7,500円",
            evidence,
            risk_level="high",
            value_type="integer",
        )
    ], ()


def _extract_exam_detail_page(
    snapshot: ITPassportSnapshot, title: str, text: str
) -> tuple[list[ITPassportFactCandidate], tuple[ITPassportParseIssue, ...]]:
    """Read only the explicitly labelled IT Passport delivery and structure block."""
    if "ITパスポート試験" not in title:
        return [], (
            ITPassportParseIssue(
                "structure_changed", "IPA IT Passport detail title was not recognized"
            ),
        )
    candidates: list[ITPassportFactCandidate] = []
    method = re.search(r"実施方式・実施時期\s*CBT方式により随時実施", text)
    if method:
        candidates.append(
            _candidate(
                snapshot,
                "exam_method",
                "CBT",
                "CBT方式により随時実施",
                method.group(0),
                risk_level="medium",
            )
        )
    structure = re.search(
        r"試験時間\s*(\d+)分\s*出題形式\s*(.+?)\s*出題数\s*(\d+)問", text
    )
    if structure:
        minutes, question_format, question_count = structure.groups()
        # _normalize_digits() converts full-width parentheses for stable
        # matching; restore the official display form.
        question_format = question_format.replace("(", "（").replace(")", "）")
        evidence = structure.group(0)
        candidates.extend(
            [
                _candidate(
                    snapshot,
                    "exam_time",
                    minutes,
                    f"試験時間 {minutes}分",
                    evidence,
                    risk_level="medium",
                    value_type="integer",
                ),
                _candidate(
                    snapshot,
                    "question_format",
                    question_format,
                    question_format,
                    evidence,
                    risk_level="medium",
                ),
                _candidate(
                    snapshot,
                    "question_count",
                    question_count,
                    f"出題数 {question_count}問",
                    evidence,
                    risk_level="medium",
                    value_type="integer",
                ),
            ]
        )
    if not candidates:
        return [], (
            ITPassportParseIssue(
                "target_fields_missing",
                "IT Passport detail page contained no supported structure fields",
            ),
        )
    return candidates, ()


def _extract_faq_page(
    snapshot: ITPassportSnapshot, title: str, text: str
) -> tuple[list[ITPassportFactCandidate], tuple[ITPassportParseIssue, ...]]:
    """Read eligibility, subject fields and pass criteria from the JITEC FAQ."""
    if "ITパスポート試験" not in title or "FAQ" not in title:
        return [], (
            ITPassportParseIssue(
                "structure_changed", "JITEC IT Passport FAQ title was not recognized"
            ),
        )
    candidates: list[ITPassportFactCandidate] = []
    eligibility = re.search(r"受験資格は特段ありません。", text)
    if eligibility:
        candidates.append(
            _candidate(
                snapshot,
                "eligibility",
                "受験資格は特段ありません",
                "受験資格は特段ありません",
                eligibility.group(0),
                risk_level="high",
            )
        )
    subjects = re.search(
        r"ストラテジ系\(経営全般\)[、､]マネジメント系\(IT管理\)[、､]テクノロジ系\(IT技術\)の3つの分野",
        text,
    )
    if subjects:
        candidates.append(
            _candidate(
                snapshot,
                "exam_subjects",
                "ストラテジ系、マネジメント系、テクノロジ系",
                "ストラテジ系、マネジメント系、テクノロジ系",
                subjects.group(0),
                risk_level="medium",
            )
        )
    passing = re.search(
        r"合格基準を満たすには、総合評価点が600点以上であるとともに、"
        r"すべての分野別評価点が300点以上である必要があります。",
        text,
    )
    if passing:
        candidates.append(
            _candidate(
                snapshot,
                "passing_standard",
                "総合評価点600点以上かつ全分野別評価点300点以上",
                "総合評価点600点以上・分野別評価点300点以上",
                _sentence_at(text, passing.start()),
                risk_level="high",
            )
        )
    if not candidates:
        return [], (
            ITPassportParseIssue(
                "target_fields_missing",
                "JITEC FAQ contained no supported eligibility, subject or pass criteria",
            ),
        )
    return candidates, ()


def extract_real_page_candidates(
    snapshot: ITPassportSnapshot,
) -> tuple[list[ITPassportFactCandidate], tuple[ITPassportParseIssue, ...]]:
    """Extract a deliberately small set of explicit facts from real JITEC HTML.

    This parser is source-specific.  It never treats navigation labels or IPA
    category cards as IT Passport facts and always returns review candidates.
    """
    soup = BeautifulSoup(snapshot.html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    text = _normalize_digits(soup.get_text(" ", strip=True))
    if snapshot.source_id == "source:it-passport:ipa-exam":
        if "試験情報" not in title:
            return [], (
                ITPassportParseIssue(
                    "structure_changed", "IPA exam page title was not recognized"
                ),
            )
        return [], ()
    if snapshot.source_id == "source:it-passport:ipa-fee":
        return _extract_fee_page(snapshot, title, text)
    if snapshot.source_id == "source:it-passport:ipa-exam-detail":
        return _extract_exam_detail_page(snapshot, title, text)
    if snapshot.source_id == "source:it-passport:jitec-faq":
        return _extract_faq_page(snapshot, title, text)
    if "ITパスポート試験" not in title:
        return [], (
            ITPassportParseIssue(
                "structure_changed", "JITEC IT Passport page title was not recognized"
            ),
        )
    if snapshot.source_id != "source:it-passport:jitec-application":
        return [], ()

    candidates: list[ITPassportFactCandidate] = []
    change_rule = re.search(
        r"受験申込内容\(試験会場、受験日時\)の変更は、試験日の3日前まで",
        text,
    )
    if change_rule:
        candidates.append(
            _candidate(
                snapshot,
                "application_change_deadline_rule",
                "P3D_BEFORE_EXAM",
                "試験日の3日前まで変更可能",
                change_rule.group(0),
                risk_level="high",
            )
        )
    opening = re.search(
        r"2026年3月24日21:30以降[^。]*から、5月以降の試験を申込むことができます",
        text,
    )
    if opening:
        candidates.append(
            _candidate(
                snapshot,
                "application_open_2026_may_sessions",
                "2026-03-24T21:30:00+09:00",
                "2026年3月24日21:30以降",
                opening.group(0),
                risk_level="high",
            )
        )
    if not candidates:
        return [], (
            ITPassportParseIssue(
                "target_fields_missing",
                "registered application page contained no supported explicit facts",
            ),
        )
    return candidates, ()


def is_registered_source_url(url: str) -> bool:
    """Return true only for HTTPS URLs on an explicitly registered host."""
    parsed = urlsplit(url)
    return parsed.scheme == "https" and any(
        parsed.hostname == source["allowed_domain"]
        for source in IT_PASSPORT_SOURCES.values()
    )


def source_plan() -> tuple[dict[str, str], ...]:
    """Expose an immutable, inspectable plan for tests and future adapters."""
    return tuple(
        {"id": source_id, **details}
        for source_id, details in IT_PASSPORT_SOURCES.items()
    )
