"""Offline-first adapter for Fundamental Information Technology (FE).

Only explicitly marked fields are accepted in fixtures. No concrete CBT dates,
fees, or eligibility are inferred from general IPA prose.
"""

from dataclasses import dataclass
from hashlib import sha256
import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from collector.http_policy import SafeFetcher


FUNDAMENTAL_IT_SOURCES = {
    "source:fundamental-it:exam": {
        "canonical_url": "https://www.ipa.go.jp/shiken/kubun/fe.html",
        "allowed_domain": "www.ipa.go.jp",
    },
    "source:fundamental-it:cbt": {
        "canonical_url": "https://www.ipa.go.jp/shiken/mousikomi/cbt_sg_fe.html",
        "allowed_domain": "www.ipa.go.jp",
    },
    "source:fundamental-it:syllabus": {
        "canonical_url": "https://www.ipa.go.jp/shiken/syllabus/index.html",
        "allowed_domain": "www.ipa.go.jp",
    },
}


@dataclass(frozen=True)
class FundamentalITSnapshot:
    source_id: str
    content_hash: str
    html: str
    synthetic: bool = True


@dataclass(frozen=True)
class FundamentalITFactCandidate:
    fact_key: str
    normalized_value: str
    display_value: str
    source_id: str
    source_snapshot_id: str
    risk_level: str = "high"
    status: str = "pending_review"
    synthetic: bool = True
    evidence_text: str | None = None
    value_type: str = "text"


@dataclass(frozen=True)
class FundamentalITParseIssue:
    code: str
    message: str


def snapshot_from_html(source_id: str, html: str, *, synthetic: bool = True) -> FundamentalITSnapshot:
    if source_id not in FUNDAMENTAL_IT_SOURCES:
        raise ValueError(f"unregistered Fundamental IT source: {source_id}")
    if not html.strip():
        raise ValueError("snapshot HTML must not be empty")
    return FundamentalITSnapshot(source_id, sha256(html.encode("utf-8")).hexdigest(), html, synthetic)


def extract_candidates(snapshot: FundamentalITSnapshot) -> tuple[list[FundamentalITFactCandidate], tuple[FundamentalITParseIssue, ...]]:
    soup = BeautifulSoup(snapshot.html, "html.parser")
    fields = {
        node.get("data-fact-key", "").strip(): node.get_text(" ", strip=True)
        for node in soup.select("[data-fact-key]")
        if node.get("data-fact-key", "").strip() and node.get_text(" ", strip=True)
    }
    candidates = [
        FundamentalITFactCandidate(
            key, value, value, snapshot.source_id, snapshot.content_hash,
            risk_level="high" if key in {"application_rule", "application_deadline", "exam_date", "fee", "eligibility"} else "medium",
            synthetic=snapshot.synthetic, evidence_text=value,
        )
        for key, value in fields.items()
    ]
    if snapshot.source_id == "source:fundamental-it:exam":
        candidates.extend(_extract_exam_page(snapshot))
    if not candidates:
        return [], (FundamentalITParseIssue("structure_changed", "no supported official fields found"),)
    return candidates, ()


def _extract_exam_page(snapshot: FundamentalITSnapshot) -> list[FundamentalITFactCandidate]:
    soup = BeautifulSoup(snapshot.html, "html.parser")
    result: list[FundamentalITFactCandidate] = []

    def add(key: str, value: str, display: str, evidence: str, value_type: str = "text") -> None:
        result.append(FundamentalITFactCandidate(
            key, value, display, snapshot.source_id, snapshot.content_hash,
            risk_level="medium", synthetic=snapshot.synthetic,
            evidence_text=evidence, value_type=value_type,
        ))

    for block in soup.select("div.def-list.--side"):
        label = block.find("dt")
        desc = block.find("dd")
        if not label or not desc:
            continue
        label_text = label.get_text(" ", strip=True)
        value_text = desc.get_text(" ", strip=True)
        if label_text == "実施方式・実施時期" and "CBT方式" in value_text:
            add("exam_method", "CBT", "CBT方式", f"{label_text} {value_text}")
            add("exam_schedule", "year_round", value_text, f"{label_text} {value_text}")

    for heading in soup.select("h4"):
        subject = heading.get_text(" ", strip=True)
        if subject not in {"科目A", "科目B"}:
            continue
        prefix = "exam_" + subject.replace("科目", "subject_").lower()
        container = heading.find_next_sibling()
        while container and getattr(container, "name", None) != "h4":
            for block in getattr(container, "select", lambda *_: [])("div.def-list.--side"):
                label = block.find("dt")
                desc = block.find("dd")
                if not label or not desc:
                    continue
                label_text = label.get_text(" ", strip=True)
                value_text = desc.get_text(" ", strip=True)
                if label_text == "試験時間":
                    minutes = re.search(r"(\d+)分", value_text)
                    if minutes:
                        add(f"{prefix}_time", minutes.group(1), value_text, f"{subject} {label_text} {value_text}", "integer")
                elif label_text == "出題形式":
                    add(f"{prefix}_format", value_text, value_text, f"{subject} {label_text} {value_text}")
                elif label_text == "出題数・解答数":
                    for kind, key in (("出題数", "question_count"), ("解答数", "answer_count")):
                        match = re.search(kind + r"：?(\d+)問", value_text)
                        if match:
                            add(f"{prefix}_{key}", match.group(1), f"{kind}：{match.group(1)}問", f"{subject} {label_text} {value_text}", "integer")
            container = container.find_next_sibling()
    return result


def fetch_fundamental_it_snapshot(fetcher: SafeFetcher, source_id: str) -> FundamentalITSnapshot | None:
    source = FUNDAMENTAL_IT_SOURCES.get(source_id)
    if source is None:
        raise ValueError(f"unregistered Fundamental IT source: {source_id}")
    result = fetcher.fetch(source["canonical_url"])
    if result.status not in {"ok", "not_modified"} or result.body is None:
        return None
    return snapshot_from_html(source_id, result.body.decode("utf-8", errors="strict"), synthetic=False)


def is_registered_source_url(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.scheme == "https" and any(parsed.hostname == source["allowed_domain"] for source in FUNDAMENTAL_IT_SOURCES.values())


def source_plan() -> tuple[dict[str, str], ...]:
    return tuple({"id": source_id, **details} for source_id, details in FUNDAMENTAL_IT_SOURCES.items())
