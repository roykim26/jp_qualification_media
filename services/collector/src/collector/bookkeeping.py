"""Offline-first source contract for 日商簿記 official pages.

Facts are level- and delivery-mode-aware. The adapter only accepts explicitly
labelled fixture fields at this registration stage; live-page parsing is added
after official snapshots are captured and their structure is frozen.
"""

from dataclasses import dataclass
from hashlib import sha256
import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup


BOOKKEEPING_SOURCES = {
    "source:bookkeeping:home": ("https://www.kentei.ne.jp/bookkeeping", "official_exam_information"),
    "source:bookkeeping:network": ("https://www.kentei.ne.jp/33013", "official_network_exam_information"),
    "source:bookkeeping:calendar-2026": ("https://www.kentei.ne.jp/calendar_2026", "official_exam_calendar"),
    "source:bookkeeping:class1-exam": ("https://www.kentei.ne.jp/bookkeeping/class1/exam", "official_level_exam_information"),
    "source:bookkeeping:class2-exam": ("https://www.kentei.ne.jp/bookkeeping/class2/exam", "official_level_exam_information"),
}

LEVELS = {"1", "2", "3", "basic", "cost-accounting-basic"}
DELIVERY_MODES = {"unified", "network", "group"}
FIELD_KEYS = {
    "exam_method", "exam_schedule", "exam_date", "fee", "exam_subjects",
    "exam_time", "question_format", "question_count", "passing_standard",
    "suspension_period", "exam_dates",
    "application_open_rule", "application_deadline_rule", "application_method_rule",
    "result_date_rule",
}


@dataclass(frozen=True)
class BookkeepingSnapshot:
    source_id: str
    content_hash: str
    html: str
    synthetic: bool = True


@dataclass(frozen=True)
class BookkeepingFactCandidate:
    fact_key: str
    normalized_value: str
    display_value: str
    source_id: str
    source_snapshot_id: str
    exam_level_id: str
    delivery_mode: str
    risk_level: str = "high"
    status: str = "pending_review"
    synthetic: bool = True
    evidence_text: str | None = None
    value_type: str = "text"


@dataclass(frozen=True)
class BookkeepingParseIssue:
    code: str
    message: str


def source_plan() -> tuple[dict[str, str], ...]:
    return tuple({"id": key, "canonical_url": value[0], "allowed_domain": "www.kentei.ne.jp", "source_type": value[1]} for key, value in BOOKKEEPING_SOURCES.items())


def is_registered_source_url(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.scheme == "https" and parsed.hostname == "www.kentei.ne.jp" and any(url == item[0] for item in BOOKKEEPING_SOURCES.values())


def snapshot_from_html(source_id: str, html: str, *, synthetic: bool = True) -> BookkeepingSnapshot:
    if source_id not in BOOKKEEPING_SOURCES:
        raise ValueError(f"unregistered bookkeeping source: {source_id}")
    if not html.strip():
        raise ValueError("snapshot HTML must not be empty")
    return BookkeepingSnapshot(source_id, sha256(html.encode("utf-8")).hexdigest(), html, synthetic)


def snapshot_from_bytes(
    source_id: str, body: bytes, *, synthetic: bool = True
) -> BookkeepingSnapshot:
    """Preserve the collector's raw-byte hash across parsing and ingestion."""
    if source_id not in BOOKKEEPING_SOURCES:
        raise ValueError(f"unregistered bookkeeping source: {source_id}")
    if not body:
        raise ValueError("snapshot body must not be empty")
    return BookkeepingSnapshot(
        source_id,
        sha256(body).hexdigest(),
        body.decode("utf-8"),
        synthetic,
    )


def extract_candidates(snapshot: BookkeepingSnapshot) -> tuple[list[BookkeepingFactCandidate], tuple[BookkeepingParseIssue, ...]]:
    soup = BeautifulSoup(snapshot.html, "html.parser")
    candidates: list[BookkeepingFactCandidate] = []
    issues: list[BookkeepingParseIssue] = []
    for node in soup.select("[data-fact-key][data-exam-level][data-delivery-mode]"):
        key = node.get("data-fact-key", "").strip()
        level = node.get("data-exam-level", "").strip()
        mode = node.get("data-delivery-mode", "").strip()
        value = node.get("data-normalized-value", "").strip() or node.get_text(" ", strip=True)
        display = node.get_text(" ", strip=True)
        if key not in FIELD_KEYS or level not in LEVELS or mode not in DELIVERY_MODES or not display:
            issues.append(BookkeepingParseIssue("invalid_contract_field", f"invalid field dimensions: {key}/{level}/{mode}"))
            continue
        candidates.append(BookkeepingFactCandidate(
            key, value, display, snapshot.source_id, snapshot.content_hash,
            f"bookkeeping:{level}", mode,
            synthetic=snapshot.synthetic, evidence_text=display,
            value_type=node.get("data-value-type", "text").strip(),
        ))
    if snapshot.source_id == "source:bookkeeping:network":
        candidates.extend(_extract_network(snapshot, soup))
    elif snapshot.source_id == "source:bookkeeping:calendar-2026":
        candidates.extend(_extract_calendar(snapshot, soup))
    elif snapshot.source_id in {"source:bookkeeping:class1-exam", "source:bookkeeping:class2-exam"}:
        candidates.extend(_extract_level_exam(snapshot, soup))
    elif snapshot.source_id == "source:bookkeeping:home":
        candidates.extend(_extract_home(snapshot, soup))
    if not candidates and not issues:
        issues.append(BookkeepingParseIssue("structure_changed", "no explicitly contracted bookkeeping fields found"))
    return candidates, tuple(issues)


def _candidate(snapshot: BookkeepingSnapshot, key: str, value: str, display: str, level: str, mode: str, value_type: str = "text", evidence: str | None = None) -> BookkeepingFactCandidate:
    return BookkeepingFactCandidate(key, value, display, snapshot.source_id, snapshot.content_hash, f"bookkeeping:{level}", mode, synthetic=snapshot.synthetic, evidence_text=evidence or display, value_type=value_type)


def _sentence(soup: BeautifulSoup, anchor: str) -> str:
    matches = [
        text
        for text in (node.get_text(" ", strip=True) for node in soup.select("p, li, td"))
        if anchor in text
    ]
    return min(matches, key=len) if matches else ""


def _extract_home(snapshot: BookkeepingSnapshot, soup: BeautifulSoup) -> list[BookkeepingFactCandidate]:
    """Kentei delegates intake to each chamber, so no national window is published.

    The official sentence that reception dates and methods differ by chamber is
    kept as a rule value; deriving concrete opening or deadline dates from it
    would invent data the provider does not publish.
    """
    window = _sentence(soup, "申込受付日時、申込受付方法は、商工会議所によって異なります")
    if not window:
        return []
    return [
        _candidate(snapshot, key, "venue_defined", window, level, "unified")
        for level in ("1", "2", "3")
        for key in ("application_open_rule", "application_deadline_rule", "application_method_rule")
    ]


def _extract_network(snapshot: BookkeepingSnapshot, soup: BeautifulSoup) -> list[BookkeepingFactCandidate]:
    text = soup.get_text(" ", strip=True)
    result: list[BookkeepingFactCandidate] = []
    if "ネット試験" not in text:
        return result
    # The unified exam's format is only stated in words on this page; the
    # calendar page lists dates without saying ペーパー形式.
    paper = _sentence(soup, "統一試験（ペーパー形式）")
    if paper:
        for level in ("1", "2", "3"):
            result.append(_candidate(snapshot, "exam_method", "ペーパー形式", "統一試験（ペーパー形式）", level, "unified", evidence=paper))
    for level, fee, minutes, count, form in (
        ("2", "5500", "90", "5", "選択式＋入力式"),
        ("3", "3300", "60", "3", "選択式＋入力式"),
        ("basic", "2200", "40", "", "選択式"),
        ("cost-accounting-basic", "2200", "40", "", "選択式"),
    ):
        label = {"2": "2級", "3": "3級", "basic": "簿記初級", "cost-accounting-basic": "原価計算初級"}[level]
        result.append(_candidate(snapshot, "exam_method", "ネット試験", f"{label} ネット試験", level, "network"))
        result.append(_candidate(snapshot, "exam_schedule", "venue_defined", "各試験会場が設定する任意の日", level, "network"))
        fee_declared = re.search(rf"{re.escape(label)}[：・\s]*{fee[0]},{fee[1:]}円", text)
        if level in {"basic", "cost-accounting-basic"} and "簿記初級・原価計算初級：2,200円" in text:
            fee_declared = True
        if fee_declared:
            result.append(_candidate(snapshot, "fee", fee, f"{label} {int(fee):,}円（税込）", level, "network", "money"))
        if re.search(rf"{re.escape(label)}.*?{minutes}分", text):
            result.append(_candidate(snapshot, "exam_time", minutes, f"{label} 試験時間 {minutes}分", level, "network", "integer"))
            result.append(_candidate(snapshot, "question_format", form, f"{label} 出題形式 {form}", level, "network"))
            if count:
                result.append(_candidate(snapshot, "question_count", count, f"{label} {count}題以内", level, "network", "integer"))
    return result


def _extract_calendar(snapshot: BookkeepingSnapshot, soup: BeautifulSoup) -> list[BookkeepingFactCandidate]:
    heading = next((h for h in soup.select("h2") if "簿記 1級~3級（統一試験）" in h.get_text(" ", strip=True)), None)
    if not heading:
        return []
    table = heading.find_next("table")
    if not table:
        return []
    text = table.get_text(" ", strip=True)
    dates = re.findall(r"(202[67])年([0-9０-９]+)月([0-9０-９]+)日", text)
    normalized_dates = [f"{year}-{int(month.translate(str.maketrans('０１２３４５６７８９','0123456789'))):02d}-{int(day.translate(str.maketrans('０１２３４５６７８９','0123456789'))):02d}" for year, month, day in dates]
    result: list[BookkeepingFactCandidate] = []
    for level, fee in (("1", "8800"), ("2", "5500"), ("3", "3300")):
        applicable = normalized_dates[:2] if level == "1" else normalized_dates
        result.append(_candidate(snapshot, "exam_dates", ",".join(applicable), "、".join(applicable), level, "unified", "json"))
        result.append(_candidate(snapshot, "fee", fee, f"{level}級 {int(fee):,}円（税込）", level, "unified", "money"))
    return result


def _extract_level_exam(snapshot: BookkeepingSnapshot, soup: BeautifulSoup) -> list[BookkeepingFactCandidate]:
    table = soup.select_one(".postContent table") or soup.select_one("table")
    if not table:
        return []
    text = table.get_text(" ", strip=True)
    level = "1" if snapshot.source_id.endswith("class1-exam") else "2"
    subjects = "商業簿記、会計学、工業簿記、原価計算" if level == "1" else "商業簿記、工業簿記（原価計算を含む）"
    result = [
        _candidate(snapshot, "exam_subjects", subjects, subjects, level, "unified"),
        _candidate(snapshot, "passing_standard", "70", "70%以上" + ("（各科目40%以上）" if level == "1" else ""), level, "unified", "integer"),
    ]
    minutes = "180" if level == "1" and text.count("90分") >= 2 else "90"
    result.append(_candidate(snapshot, "exam_time", minutes, f"試験時間 合計{minutes}分", level, "unified", "integer"))
    if level == "2" and "5題以内" in text:
        result.append(_candidate(snapshot, "question_count", "5", "5題以内", level, "unified", "integer"))
    announcement = _sentence(soup, "合格発表の期日や方法、証書の受け渡し方法等は、商工会議所によって異なります")
    if announcement:
        result.append(_candidate(snapshot, "result_date_rule", "venue_defined", announcement, level, "unified"))
    return result
