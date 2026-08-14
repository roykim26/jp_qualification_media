"""Offline-first source and field contract for FP技能検定."""

from dataclasses import dataclass
from hashlib import sha256
import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup


FP_SOURCES = {
    "source:fp:jafp-home": ("https://www.jafp.or.jp/exam/", "jafp"),
    "source:fp:jafp-2-3-outline": ("https://www.jafp.or.jp/exam/outline/", "jafp"),
    "source:fp:jafp-1-outline": ("https://www.jafp.or.jp/exam/outline/1fp/index.shtml", "jafp"),
    "source:fp:kinzai-home": ("https://www.kinzai.or.jp/ginou/fp/", "kinzai"),
    "source:fp:kinzai-1-academic": ("https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html", "kinzai"),
    "source:fp:kinzai-1-practical": ("https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html", "kinzai"),
    "source:fp:kinzai-2": ("https://www.kinzai.or.jp/ginou/fp/2kyu/index.html", "kinzai"),
    "source:fp:kinzai-3": ("https://www.kinzai.or.jp/ginou/fp/3kyu/index.html", "kinzai"),
    "source:fp:kinzai-eligibility": ("https://www.kinzai.or.jp/ginou/fp/sikaku.html", "kinzai"),
}
LEVELS = {"1", "2", "3"}
PROVIDERS = {"jafp", "kinzai"}
COMPONENTS = {"academic", "academic:basic", "academic:applied", "practical:asset-design", "practical:asset-consulting", "practical:individual-assets", "practical:small-business", "practical:insurance-customer", "practical:general"}
DELIVERY_MODES = {"cbt", "pbt", "interview"}
FACT_KEYS = {"exam_method", "exam_schedule", "exam_date", "exam_time", "question_count", "question_format", "passing_standard", "fee", "eligibility", "practical_subject", "interview_count"}


@dataclass(frozen=True)
class FPSnapshot:
    source_id: str
    content_hash: str
    html: str
    synthetic: bool = True


@dataclass(frozen=True)
class FPFactCandidate:
    fact_key: str
    normalized_value: str
    display_value: str
    source_id: str
    source_snapshot_id: str
    provider_id: str
    exam_level_id: str
    exam_component: str
    delivery_mode: str
    status: str = "pending_review"
    risk_level: str = "high"
    synthetic: bool = True
    evidence_text: str | None = None
    value_type: str = "text"


@dataclass(frozen=True)
class FPParseIssue:
    code: str
    message: str


def source_plan() -> tuple[dict[str, str], ...]:
    return tuple({"id": key, "canonical_url": value[0], "provider_id": value[1], "allowed_domain": urlsplit(value[0]).hostname or ""} for key, value in FP_SOURCES.items())


def is_registered_source_url(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.scheme == "https" and any(url == item[0] for item in FP_SOURCES.values())


def snapshot_from_html(source_id: str, html: str, *, synthetic: bool = True) -> FPSnapshot:
    if source_id not in FP_SOURCES:
        raise ValueError(f"unregistered FP source: {source_id}")
    if not html.strip():
        raise ValueError("snapshot HTML must not be empty")
    return FPSnapshot(source_id, sha256(html.encode("utf-8")).hexdigest(), html, synthetic)


def extract_candidates(snapshot: FPSnapshot) -> tuple[list[FPFactCandidate], tuple[FPParseIssue, ...]]:
    soup = BeautifulSoup(snapshot.html, "html.parser")
    candidates: list[FPFactCandidate] = []
    issues: list[FPParseIssue] = []
    expected_provider = FP_SOURCES[snapshot.source_id][1]
    for node in soup.select("[data-fact-key][data-provider][data-exam-level][data-exam-component][data-delivery-mode]"):
        key = node.get("data-fact-key", "").strip()
        provider = node.get("data-provider", "").strip()
        level = node.get("data-exam-level", "").strip()
        component = node.get("data-exam-component", "").strip()
        mode = node.get("data-delivery-mode", "").strip()
        display = node.get_text(" ", strip=True)
        value = node.get("data-normalized-value", "").strip() or display
        valid = key in FACT_KEYS and provider == expected_provider and provider in PROVIDERS and level in LEVELS and component in COMPONENTS and mode in DELIVERY_MODES and display
        if not valid:
            issues.append(FPParseIssue("invalid_contract_dimensions", f"invalid FP dimensions: {provider}/{level}/{component}/{mode}/{key}"))
            continue
        candidates.append(FPFactCandidate(key, value, display, snapshot.source_id, snapshot.content_hash, provider, f"fp:{level}", component, mode, synthetic=snapshot.synthetic, evidence_text=display, value_type=node.get("data-value-type", "text")))
    if snapshot.source_id == "source:fp:jafp-2-3-outline":
        candidates.extend(_extract_jafp_2_3(snapshot, soup))
    elif snapshot.source_id == "source:fp:kinzai-1-academic":
        candidates.extend(_extract_kinzai_1_academic(snapshot, soup))
    elif snapshot.source_id == "source:fp:kinzai-1-practical":
        candidates.extend(_extract_kinzai_1_practical(snapshot, soup))
    if not candidates and not issues:
        issues.append(FPParseIssue("structure_changed", "no explicitly contracted FP fields found"))
    return candidates, tuple(issues)


def _candidate(snapshot: FPSnapshot, key: str, value: str, display: str, provider: str, level: str, component: str, mode: str, value_type: str = "text", evidence: str | None = None) -> FPFactCandidate:
    return FPFactCandidate(key, value, display, snapshot.source_id, snapshot.content_hash, provider, f"fp:{level}", component, mode, synthetic=snapshot.synthetic, evidence_text=evidence or display, value_type=value_type)


def _extract_jafp_2_3(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    specs_heading = soup.select_one("#Section04")
    fee_heading = soup.select_one("#Section09")
    if not specs_heading or not fee_heading:
        return []
    specs_table = specs_heading.find_next("table")
    fee_table = fee_heading.find_next("table")
    if not specs_table or not fee_table:
        return []
    result: list[FPFactCandidate] = []
    current_level = ""
    for row in specs_table.select("tr")[1:]:
        cells = [cell.get_text(" ", strip=True) for cell in row.select("td")]
        if len(cells) == 6:
            current_level, subject, minutes, count, form, passing = cells
        elif len(cells) == 5 and current_level:
            subject, minutes, count, form, passing = cells
        else:
            continue
        level = current_level.replace("級", "")
        component = "academic" if "学科" in subject else "practical:asset-design"
        evidence = " / ".join(cells)
        result.extend([
            _candidate(snapshot, "exam_method", "CBT", f"{current_level} {subject} CBT方式", "jafp", level, component, "cbt", evidence=evidence),
            _candidate(snapshot, "exam_time", re.sub(r"\D", "", minutes), minutes, "jafp", level, component, "cbt", "integer", evidence),
            _candidate(snapshot, "question_count", re.sub(r"\D", "", count), count, "jafp", level, component, "cbt", "integer", evidence),
            _candidate(snapshot, "question_format", form, form, "jafp", level, component, "cbt", evidence=evidence),
            _candidate(snapshot, "passing_standard", passing, passing, "jafp", level, component, "cbt", evidence=evidence),
        ])
    fee_values: dict[tuple[str, str], str] = {}
    current_level = ""
    for row in fee_table.select("tr")[1:]:
        cells = [cell.get_text(" ", strip=True) for cell in row.select("td")]
        if len(cells) == 3:
            current_level, subject, amount = cells
        elif len(cells) == 2 and current_level:
            subject, amount = cells
        else:
            continue
        if subject in {"学科試験", "実技試験"}:
            fee_values[(current_level.replace("級", ""), "academic" if "学科" in subject else "practical:asset-design")] = re.sub(r"\D", "", amount)
    for (level, component), amount in fee_values.items():
        result.append(_candidate(snapshot, "fee", amount, f"{int(amount):,}円（非課税）", "jafp", level, component, "cbt", "money"))
    return result


def _extract_kinzai_1_academic(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    time_heading, format_heading, fee_heading = soup.select_one("#exam-time"), soup.select_one("#exam-format"), soup.select_one("#exam-fee")
    if not time_heading or not format_heading or not fee_heading:
        return []
    table = format_heading.find_next("table")
    if not table:
        return []
    result = [
        _candidate(snapshot, "exam_method", "PBT", "筆記試験", "kinzai", "1", "academic", "pbt"),
        _candidate(snapshot, "exam_time", "300", "基礎編150分・応用編150分（合計300分）", "kinzai", "1", "academic", "pbt", "integer"),
        _candidate(snapshot, "passing_standard", "120/200", "120点以上（200点満点）", "kinzai", "1", "academic", "pbt"),
    ]
    for row in table.select("tr")[1:]:
        cells = [cell.get_text(" ", strip=True) for cell in row.select("td")]
        if len(cells) < 3:
            continue
        section, form, count = cells[:3]
        component = "academic:basic" if section == "基礎編" else "academic:applied"
        result.append(_candidate(snapshot, "question_format", form, form, "kinzai", "1", component, "pbt", evidence=" / ".join(cells)))
        result.append(_candidate(snapshot, "question_count", re.sub(r"\D", "", count), count, "kinzai", "1", component, "pbt", "integer", " / ".join(cells)))
    fee_text = fee_heading.find_next("p").get_text(" ", strip=True)
    amount = re.sub(r"\D", "", fee_text)
    result.append(_candidate(snapshot, "fee", amount, fee_text, "kinzai", "1", "academic", "pbt", "money"))
    return result


def _extract_kinzai_1_practical(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    format_heading, fee_heading = soup.select_one("#syutudai"), soup.select_one("#exam-fee")
    if not format_heading or not fee_heading:
        return []
    block = format_heading.find_previous("ul", class_="list")
    block_text = block.get_text(" ", strip=True) if block else ""
    fee_text = fee_heading.find_next("p").get_text(" ", strip=True)
    return [
        _candidate(snapshot, "practical_subject", "asset_consulting", "資産相談業務", "kinzai", "1", "practical:asset-consulting", "interview"),
        _candidate(snapshot, "exam_method", "interview", "対面の口述試験", "kinzai", "1", "practical:asset-consulting", "interview", evidence=block_text),
        _candidate(snapshot, "interview_count", "2", "面接2回", "kinzai", "1", "practical:asset-consulting", "interview", "integer", block_text),
        _candidate(snapshot, "exam_time", "12", "各面接 約12分", "kinzai", "1", "practical:asset-consulting", "interview", "integer", block_text),
        _candidate(snapshot, "question_format", "oral", "口頭試問方式", "kinzai", "1", "practical:asset-consulting", "interview"),
        _candidate(snapshot, "passing_standard", "120/200", "200点満点で120点以上", "kinzai", "1", "practical:asset-consulting", "interview"),
        _candidate(snapshot, "fee", re.sub(r"\D", "", fee_text), fee_text, "kinzai", "1", "practical:asset-consulting", "interview", "money"),
    ]
