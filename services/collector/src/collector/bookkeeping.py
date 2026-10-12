"""Offline-first source contract for 日商簿記 official pages.

Facts are level- and delivery-mode-aware. The adapter only accepts explicitly
labelled fixture fields at this registration stage; live-page parsing is added
after official snapshots are captured and their structure is frozen.
"""

from dataclasses import dataclass
from hashlib import sha256
import re
from unicodedata import normalize
from urllib.parse import urlsplit

from bs4 import BeautifulSoup


BOOKKEEPING_SOURCES = {
    "source:bookkeeping:home": ("https://www.kentei.ne.jp/bookkeeping", "official_exam_information"),
    "source:bookkeeping:network": ("https://www.kentei.ne.jp/33013", "official_network_exam_information"),
    "source:bookkeeping:calendar-2026": ("https://www.kentei.ne.jp/calendar_2026", "official_exam_calendar"),
    "source:bookkeeping:class1-exam": ("https://www.kentei.ne.jp/bookkeeping/class1/exam", "official_level_exam_information"),
    "source:bookkeeping:class2-exam": ("https://www.kentei.ne.jp/bookkeeping/class2/exam", "official_level_exam_information"),
    "source:bookkeeping:class1": ("https://www.kentei.ne.jp/bookkeeping/class1", "official_level_information"),
    "source:bookkeeping:class2": ("https://www.kentei.ne.jp/bookkeeping/class2", "official_level_information"),
    "source:bookkeeping:class3": ("https://www.kentei.ne.jp/bookkeeping/class3", "official_level_information"),
    "source:bookkeeping:class3-exam": ("https://www.kentei.ne.jp/bookkeeping/class3/exam", "official_level_exam_information"),
    "source:bookkeeping:flow": ("https://www.kentei.ne.jp/flow", "official_application_flow"),
    "source:bookkeeping:report": ("https://www.kentei.ne.jp/report", "official_exam_notice"),
    "source:bookkeeping:qa": ("https://www.kentei.ne.jp/qa", "official_faq"),
    "source:bookkeeping:flow-teller": ("https://www.kentei.ne.jp/flow/teller", "official_application_flow"),
    "source:bookkeeping:flow-net": ("https://www.kentei.ne.jp/flow/net", "official_application_flow"),
    "source:bookkeeping:news-51504": ("https://www.kentei.ne.jp/51504", "official_announcement"),
    # Work package F: the only official page carrying the historical applicant,
    # examinee, passed and pass-rate series.  No extractor reads it yet.
    "source:bookkeeping:candidate-data": ("https://www.kentei.ne.jp/bookkeeping/candidate-data", "official_statistics"),
    # Work package F-2: the six per-level history sub-pages linked from
    # candidate-data.  URLs are verbatim from that snapshot; #2/#3 keep the
    # legacy bookkeeping_contents segment and #6 keeps the official "ca-date"
    # spelling.  No extractor reads any of them yet.
    "source:bookkeeping:candidate-data-class1": ("https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class1", "official_statistics"),
    "source:bookkeeping:candidate-data-class2": ("https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class2", "official_statistics"),
    "source:bookkeeping:candidate-data-class3": ("https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class3", "official_statistics"),
    "source:bookkeeping:candidate-data-class23-net": ("https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class2-3", "official_statistics"),
    "source:bookkeeping:candidate-data-class4": ("https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class4", "official_statistics"),
    "source:bookkeeping:candidate-data-costing": ("https://www.kentei.ne.jp/bookkeeping/candidate-data/ca-date", "official_statistics"),
}

LEVELS = {"1", "2", "3", "basic", "cost-accounting-basic"}
DELIVERY_MODES = {"unified", "network", "group"}
FIELD_KEYS = {
    "exam_method", "exam_schedule", "exam_date", "fee", "exam_subjects",
    "exam_time", "question_format", "question_count", "passing_standard",
    "suspension_period", "exam_dates", "eligibility",
    "application_open_rule", "application_deadline_rule", "application_method_rule",
    "payment_deadline_rule", "result_date_rule",
    "applicants", "examinees", "passed", "pass_rate", "statistics_methodology",
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
    exam_year: int | None = None
    exam_session: str | None = None


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
    elif snapshot.source_id == "source:bookkeeping:class3-exam":
        candidates.extend(_extract_class3_format(snapshot, soup))
    elif snapshot.source_id == "source:bookkeeping:qa":
        candidates.extend(_extract_qa_eligibility(snapshot, soup))
    elif snapshot.source_id == "source:bookkeeping:flow-teller":
        candidates.extend(_extract_flow_payment_rule(snapshot, soup))
    elif snapshot.source_id == "source:bookkeeping:home":
        candidates.extend(_extract_home(snapshot, soup))
    elif snapshot.source_id in {*STATISTICS_UNIFIED_SOURCES, STATISTICS_NET_SOURCE, STATISTICS_MIXED_SOURCE, STATISTICS_COSTING_SOURCE}:
        candidates.extend(_extract_statistics(snapshot, soup, issues))
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


def _clause(soup: BeautifulSoup, anchor: str) -> str:
    """Return only the official sentence carrying the anchor.

    `_sentence` yields the whole list item, which would mix unrelated notes
    (privacy notices, other chambers' rules) into a display value. Sentences
    split on 。 only outside parentheses because Kentei nests full clauses in
    「（…）」 notes.
    """
    text = _sentence(soup, anchor)
    if not text:
        return ""
    buffer, depth = "", 0
    for character in text:
        if character in "（「":
            depth += 1
        elif character in "）」":
            depth = max(0, depth - 1)
        buffer += character
        if character == "。" and depth == 0:
            if anchor in buffer:
                return buffer.strip().lstrip("※").strip()
            buffer = ""
    return text


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
    result.extend(_extract_answer_format(snapshot, soup, level))
    return result


BOOKLET_PHRASE = "問題用紙・答案用紙・計算用紙が一体となった冊子"


def _extract_answer_format(snapshot: BookkeepingSnapshot, soup: BeautifulSoup, level: str) -> list[BookkeepingFactCandidate]:
    """1 級 retrieves only the answer sheet while 2 級 and 3 級 use one booklet.

    The two wordings are level-specific, so copying one across levels would
    state an answer-sheet form the chamber never published for that level.
    """
    if level == "1":
        collection = _clause(soup, "答案用紙を回収します")
        takeaway = _clause(soup, "持ち帰りを認めます")
        if not collection or not takeaway:
            return []
        display = f"{collection}{takeaway}"
        return [_candidate(snapshot, "question_format", "答案用紙を回収します", display, level, "unified", evidence=display)]
    booklet = _clause(soup, "一体となった冊子")
    if not booklet:
        return []
    return [_candidate(snapshot, "question_format", BOOKLET_PHRASE, booklet, level, "unified", evidence=booklet)]


def _extract_class3_format(snapshot: BookkeepingSnapshot, soup: BeautifulSoup) -> list[BookkeepingFactCandidate]:
    return _extract_answer_format(snapshot, soup, "3")


def _extract_qa_eligibility(snapshot: BookkeepingSnapshot, soup: BeautifulSoup) -> list[BookkeepingFactCandidate]:
    """The Q&A answers 簿記 level order explicitly and names no eligibility test.

    The 「2級に合格していること」 condition in the same answer is reserved for
    DCプランナー1級, so it does not restrict 日商簿記 levels.
    """
    free = _clause(soup, "どの級(クラス)から受験していただいても構いません")
    if not free:
        return []
    order = _clause(soup, "2級あるいは1級を受験できます")
    display = f"{free}{order}" if order else free
    return [
        _candidate(snapshot, "eligibility", "どの級(クラス)から受験していただいても構いません", display, level, "unified", evidence=display)
        for level in ("1", "2", "3")
    ]


def _extract_flow_payment_rule(snapshot: BookkeepingSnapshot, soup: BeautifulSoup) -> list[BookkeepingFactCandidate]:
    """Kentei collects the unified-exam fee through each chamber's own window.

    No national payment deadline exists on this page, so the published
    dependency is stored as a rule instead of an invented date.
    """
    fee = _clause(soup, "受験料の支払方法等をご確認ください")
    if not fee:
        return []
    window = _clause(soup, "受験申込受付期間は、商工会議所によって異なります")
    display = f"{fee}{window}" if window else fee
    return [
        _candidate(snapshot, "payment_deadline_rule", "venue_defined", display, level, "unified", evidence=display)
        for level in ("1", "2", "3")
    ]


# Work package F: the seven captured statistics pages.  candidate-data itself
# prints a recent slice of the same tables, so it stays evidence-only and the
# per-level history pages are the single ingestable series.
STATISTICS_UNIFIED_SOURCES = {
    "source:bookkeeping:candidate-data-class1": ("1", "unified"),
    "source:bookkeeping:candidate-data-class2": ("2", "unified"),
    "source:bookkeeping:candidate-data-class3": ("3", "unified"),
}
STATISTICS_NET_SOURCE = "source:bookkeeping:candidate-data-class23-net"
STATISTICS_NET_LEVELS = {"2級": "2", "3級": "3"}
STATISTICS_MIXED_SOURCE = "source:bookkeeping:candidate-data-class4"
STATISTICS_COSTING_SOURCE = "source:bookkeeping:candidate-data-costing"
# data_class4 prints 簿記初級（期間 block）above the retired 4級（回 block）.
STATISTICS_BLOCK_SERIES = {
    "期間": ("basic", "network"),
    "回": ("4", "unified"),
}
# The coverage contract declares statistics requirements only for 1・2・3級, so 簿記
# 初級, 4級 and 原価計算初級 rows are parsed but not emitted until those levels are
# declared.  Their pages stay captured as byte-stable evidence.
STATISTICS_CONTRACT_SERIES = {
    ("1", "unified"),
    ("2", "unified"),
    ("3", "unified"),
    ("2", "network"),
    ("3", "network"),
}
# Values are keyed by the officially printed column label.  The net tables carry
# a bare 「受験者数」 with no 「(申込者数)」 annotation and no 実受験者数 column, so the
# page never says whether that count is applications or actual examinees; it is
# deliberately left unmapped instead of guessed into either field.
STATISTICS_COLUMNS = {
    "受験者数(申込者数)": ("applicants", "integer"),
    "実受験者数": ("examinees", "integer"),
    "合格者数": ("passed", "integer"),
    "合格率": ("pass_rate", "decimal"),
}
STATISTICS_SESSION_RE = re.compile(r"(\d+)\((.+)\)")
STATISTICS_GREGORIAN_RE = re.compile(r"(\d{4})\.(\d{1,2})\.(\d{1,2})")
STATISTICS_HEISEI_RE = re.compile(r"H(\d{2})\.(\d{1,2})\.(\d{1,2})")
STATISTICS_PERIOD_RE = re.compile(r"(\d{4})年")
STATISTICS_COUNT_RE = re.compile(r"([\d,]+)名")
STATISTICS_RATE_RE = re.compile(r"(\d+(?:\.\d+)?)%")
NET_SCOPE_ANCHOR = "3方式いずれも出題範囲や問題の難易度は同じ"


def _printed_label(cell: str) -> str:
    """Fold full-width punctuation, digits and spacing so labels compare reliably."""
    return re.sub(r"\s+", "", normalize("NFKC", cell))


def _statistics_session(first_cell: str) -> tuple[str, int] | None:
    """Return the 回 number and its calendar year, e.g. 173（2026.06.14）."""
    match = STATISTICS_SESSION_RE.fullmatch(_printed_label(first_cell))
    if not match:
        return None
    for pattern, base in ((STATISTICS_GREGORIAN_RE, 0), (STATISTICS_HEISEI_RE, 1988)):
        parsed = pattern.fullmatch(match.group(2))
        if parsed:
            return match.group(1), base + int(parsed.group(1))
    return None


def _statistics_period(first_cell: str) -> int | None:
    """A 期間 row is one fiscal window; the printed start year keys the row."""
    match = STATISTICS_PERIOD_RE.match(_printed_label(first_cell))
    return int(match.group(1)) if match else None


def _statistics_blocks(table) -> list[tuple[list[str], list[list[str]]]]:
    """Split a table on each header row: data_class4 prints two blocks in one table."""
    blocks: list[tuple[list[str], list[list[str]]]] = []
    for row in table.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if not cells:
            continue
        labels = [cell.get_text(" ", strip=True) for cell in cells]
        if any(cell.name == "th" for cell in cells):
            blocks.append((labels, []))
        elif blocks:
            blocks[-1][1].append(labels)
    return blocks


def _statistics_series(source_id: str, table, columns: list[str]) -> tuple[str, str] | None:
    if source_id in STATISTICS_UNIFIED_SOURCES:
        return STATISTICS_UNIFIED_SOURCES[source_id]
    if source_id == STATISTICS_COSTING_SOURCE:
        return ("cost-accounting-basic", "network")
    if source_id == STATISTICS_MIXED_SOURCE:
        return STATISTICS_BLOCK_SERIES.get(_printed_label(columns[0]))
    if source_id == STATISTICS_NET_SOURCE:
        heading = table.find_previous(["h2", "h3"])
        label = _printed_label(heading.get_text("", strip=True)) if heading else ""
        for name, level in STATISTICS_NET_LEVELS.items():
            if label == _printed_label(name):
                return (level, "network")
    return None


def _statistics_row_values(columns: list[str], cells: list[str]):
    """Return (values, exam_session, exam_year); empty values means unparsed."""
    values: list[tuple[str, str, str, str]] = []
    for index, column in enumerate(columns):
        fact = STATISTICS_COLUMNS.get(_printed_label(column))
        if fact is None:
            continue
        pattern = STATISTICS_RATE_RE if fact[0] == "pass_rate" else STATISTICS_COUNT_RE
        parsed = pattern.fullmatch(_printed_label(cells[index]))
        if not parsed:
            return [], None, None
        values.append((fact[0], fact[1], parsed.group(1).replace(",", ""), column))
    key = _printed_label(columns[0])
    if key == "回":
        session = _statistics_session(cells[0])
        if session is None:
            return [], None, None
        return values, session[0], session[1]
    if key == "期間":
        year = _statistics_period(cells[0])
        if year is None:
            return [], None, None
        return values, None, year
    return values, None, None


def _extract_statistics(
    snapshot: BookkeepingSnapshot,
    soup: BeautifulSoup,
    issues: list[BookkeepingParseIssue],
) -> list[BookkeepingFactCandidate]:
    numbers: list[BookkeepingFactCandidate] = []
    methodology: dict[tuple[str, str], list[str]] = {}

    def note(series: tuple[str, str], text: str) -> None:
        texts = methodology.setdefault(series, [])
        if text and text not in texts:
            texts.append(text)

    for table in soup.find_all("table"):
        for columns, rows in _statistics_blocks(table):
            series = _statistics_series(snapshot.source_id, table, columns)
            if series is None or series not in STATISTICS_CONTRACT_SERIES:
                continue
            note(series, "/".join(columns))
            if series[1] == "network":
                note(series, _sentence(soup, NET_SCOPE_ANCHOR))
            for cells in rows:
                if any(_printed_label(cell) == "中止" for cell in cells):
                    # A cancelled 回 prints only 「中止」.  It is neither a zero nor a
                    # structural change, so it contributes no value.
                    continue
                if len(cells) != len(columns):
                    issues.append(BookkeepingParseIssue("unparsed_statistics_row", " ".join(cells)))
                    continue
                values, session, year = _statistics_row_values(columns, cells)
                if not values or year is None:
                    issues.append(BookkeepingParseIssue("unparsed_statistics_row", " ".join(cells)))
                    continue
                for fact_key, value_type, normalized, column in values:
                    numbers.append(
                        BookkeepingFactCandidate(
                            fact_key,
                            normalized,
                            f"{cells[columns.index(column)]} {column}（{cells[0]}）",
                            snapshot.source_id,
                            snapshot.content_hash,
                            f"bookkeeping:{series[0]}",
                            series[1],
                            value_type=value_type,
                            evidence_text=" | ".join(cells),
                            synthetic=snapshot.synthetic,
                            exam_year=year,
                            exam_session=session,
                        )
                    )

    facts: list[BookkeepingFactCandidate] = []
    for (level, mode), texts in sorted(methodology.items()):
        for text in texts:
            facts.append(
                BookkeepingFactCandidate(
                    "statistics_methodology",
                    text,
                    text,
                    snapshot.source_id,
                    snapshot.content_hash,
                    f"bookkeeping:{level}",
                    mode,
                    synthetic=snapshot.synthetic,
                    evidence_text=text,
                )
            )
    return facts + numbers
