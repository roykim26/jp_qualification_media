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


def extract_real_page_candidates(
    snapshot: ITPassportSnapshot,
) -> tuple[list[ITPassportFactCandidate], tuple[ITPassportParseIssue, ...]]:
    """Extract a deliberately small set of explicit facts from real JITEC HTML.

    This parser is source-specific.  It never treats navigation labels or IPA
    category cards as IT Passport facts and always returns review candidates.
    """
    soup = BeautifulSoup(snapshot.html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if snapshot.source_id == "source:it-passport:ipa-exam":
        if "試験情報" not in title:
            return [], (
                ITPassportParseIssue(
                    "structure_changed", "IPA exam page title was not recognized"
                ),
            )
        return [], ()
    if "ITパスポート試験" not in title:
        return [], (
            ITPassportParseIssue(
                "structure_changed", "JITEC IT Passport page title was not recognized"
            ),
        )
    if snapshot.source_id != "source:it-passport:jitec-application":
        return [], ()

    text = _normalize_digits(soup.get_text(" ", strip=True))
    candidates: list[ITPassportFactCandidate] = []
    change_rule = re.search(
        r"受験申込内容\(試験会場、受験日時\)の変更は、試験日の3日前まで",
        text,
    )
    if change_rule:
        evidence = change_rule.group(0)
        candidates.append(
            ITPassportFactCandidate(
                fact_key="application_change_deadline_rule",
                normalized_value="P3D_BEFORE_EXAM",
                display_value="試験日の3日前まで変更可能",
                source_id=snapshot.source_id,
                source_snapshot_id=snapshot.content_hash,
                risk_level="high",
                synthetic=snapshot.synthetic,
                evidence_text=evidence,
            )
        )
    opening = re.search(
        r"2026年3月24日21:30以降[^。]*から、5月以降の試験を申込むことができます",
        text,
    )
    if opening:
        evidence = opening.group(0)
        candidates.append(
            ITPassportFactCandidate(
                fact_key="application_open_2026_may_sessions",
                normalized_value="2026-03-24T21:30:00+09:00",
                display_value="2026年3月24日21:30以降",
                source_id=snapshot.source_id,
                source_snapshot_id=snapshot.content_hash,
                risk_level="high",
                synthetic=snapshot.synthetic,
                evidence_text=evidence,
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
