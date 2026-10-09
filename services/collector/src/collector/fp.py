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
    "source:fp:jafp-schedule": ("https://www.jafp.or.jp/exam/schedule/", "jafp"),
    "source:fp:jafp-2-3-application": ("https://www.jafp.or.jp/exam/app/3fp.shtml", "jafp"),
    "source:fp:kinzai-home": ("https://www.kinzai.or.jp/ginou/fp/", "kinzai"),
    "source:fp:kinzai-1-academic": ("https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html", "kinzai"),
    "source:fp:kinzai-1-practical": ("https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html", "kinzai"),
    "source:fp:kinzai-2": ("https://www.kinzai.or.jp/ginou/fp/2kyu/index.html", "kinzai"),
    "source:fp:kinzai-3": ("https://www.kinzai.or.jp/ginou/fp/3kyu/index.html", "kinzai"),
    "source:fp:kinzai-eligibility": ("https://www.kinzai.or.jp/ginou/fp/sikaku.html", "kinzai"),
    "source:fp:kinzai-schedule": ("https://www.kinzai.or.jp/ginou/fp/nittei-fp", "kinzai"),
    "source:fp:kinzai-schedule-2026": ("https://www.kinzai.or.jp/fp/nittei-fp/48581.html", "kinzai"),
}
LEVELS = {"1", "2", "3"}
PROVIDERS = {"jafp", "kinzai"}
COMPONENTS = {"academic", "academic:basic", "academic:applied", "practical:asset-design", "practical:asset-consulting", "practical:individual-assets", "practical:small-business", "practical:insurance-customer", "practical:general"}
DELIVERY_MODES = {"cbt", "pbt", "interview"}
FACT_KEYS = {"exam_method", "exam_schedule", "exam_date", "exam_dates", "exam_time", "question_count", "question_format", "passing_standard", "fee", "eligibility", "practical_subject", "interview_count", "application_open", "application_deadline", "application_open_rule", "application_deadline_rule", "result_date"}


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
        candidates.extend(_extract_jafp_2_3_application_rule(snapshot, soup))
    elif snapshot.source_id == "source:fp:jafp-schedule":
        candidates.extend(_extract_jafp_2_3_schedule(snapshot, soup))
    elif snapshot.source_id == "source:fp:kinzai-1-academic":
        candidates.extend(_extract_kinzai_1_academic(snapshot, soup))
    elif snapshot.source_id == "source:fp:kinzai-1-practical":
        candidates.extend(_extract_kinzai_1_practical(snapshot, soup))
    elif snapshot.source_id == "source:fp:kinzai-eligibility":
        candidates.extend(_extract_kinzai_eligibility(snapshot, soup))
    elif snapshot.source_id == "source:fp:kinzai-schedule-2026":
        candidates.extend(_extract_kinzai_2026_schedule(snapshot, soup))
    if not candidates and not issues:
        issues.append(FPParseIssue("structure_changed", "no explicitly contracted FP fields found"))
    return candidates, tuple(issues)


def _candidate(snapshot: FPSnapshot, key: str, value: str, display: str, provider: str, level: str, component: str, mode: str, value_type: str = "text", evidence: str | None = None) -> FPFactCandidate:
    return FPFactCandidate(key, value, display, snapshot.source_id, snapshot.content_hash, provider, f"fp:{level}", component, mode, synthetic=snapshot.synthetic, evidence_text=evidence or display, value_type=value_type)


def _digits(value: str) -> str:
    return value.translate(str.maketrans("０１２３４５６７８９", "0123456789"))


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
    result.extend(_extract_jafp_2_3_eligibility(snapshot, soup))
    return result


def _extract_jafp_2_3_eligibility(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    section = soup.select_one("#Section07")
    if not section:
        return []
    level_two = next((heading for heading in section.find_all_next("h4") if heading.get_text(" ", strip=True) == "2級"), None)
    level_three = next((heading for heading in section.find_all_next("h4") if heading.get_text(" ", strip=True) == "3級"), None)
    if not level_two or not level_three:
        return []
    two_table = level_two.find_next("table")
    three_text = level_three.find_next("p")
    if not two_table or not three_text:
        return []
    two_rows = [row.get_text(" ", strip=True) for row in two_table.select("tr")[1:]]
    two_evidence = " / ".join(two_rows)
    three_evidence = three_text.get_text(" ", strip=True)
    if not two_evidence or not three_evidence:
        return []
    result: list[FPFactCandidate] = []
    for level, evidence in (("2", two_evidence), ("3", three_evidence)):
        for component in ("academic", "practical:asset-design"):
            result.append(_candidate(snapshot, "eligibility", evidence, evidence, "jafp", level, component, "cbt", evidence=evidence))
    return result


def _extract_jafp_2_3_application_rule(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    """Model the published CBT availability as an application rule.

    JAFP publishes no 受検申請期間 column for 2級・3級 because the CBT exam is
    taken year-round; only the 休止期間 table bounds it.  Inferring concrete
    opening and deadline dates from that layout would invent data.
    """
    paragraphs = [node.get_text(" ", strip=True) for node in soup.select("p, li, td")]
    always_open = min((text for text in paragraphs if "随時受検ができるCBT" in text), key=len, default="")
    center_slot = min((text for text in paragraphs if "休止期間を除き、テストセンターの空いている日時" in text), key=len, default="")
    if not always_open:
        return []
    deadline_evidence = center_slot or always_open
    result: list[FPFactCandidate] = []
    for level in ("2", "3"):
        for component in ("academic", "practical:asset-design"):
            result.append(_candidate(snapshot, "application_open_rule", "随時", always_open, "jafp", level, component, "cbt", evidence=always_open))
            result.append(_candidate(snapshot, "application_deadline_rule", "締切日なし", deadline_evidence, "jafp", level, component, "cbt", evidence=deadline_evidence))
    return result


def _extract_jafp_2_3_schedule(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    heading = next((node for node in soup.select("h3") if "2級・3級FP技能検定" in node.get_text(" ", strip=True) and "CBT試験" in node.get_text(" ", strip=True)), None)
    table = heading.find_next("table") if heading else None
    if not table:
        return []
    rows = table.select("tr")[1:]
    exam_dates: list[str] = []
    result_dates: list[str] = []
    evidence: list[str] = []
    for row in rows:
        cells = [cell.get_text(" ", strip=True) for cell in row.select("td")]
        if len(cells) < 2:
            continue
        period, result = cells[0], cells[1]
        period_match = re.search(
            r"(202[67])年([0-9０-９]+)月([0-9０-９]+)日\s*～\s*(?:(202[67])年)?([0-9０-９]+)月([0-9０-９]+)日",
            period,
        )
        if not period_match:
            continue
        start_year, start_month, start_day, end_year, end_month, end_day = period_match.groups()
        end_year = end_year or start_year
        normalized_period = [
            f"{start_year}-{int(_digits(start_month)):02d}-{int(_digits(start_day)):02d}",
            f"{end_year}-{int(_digits(end_month)):02d}-{int(_digits(end_day)):02d}",
        ]
        exam_dates.extend(normalized_period)
        result_match = re.search(r"([0-9０-９]+)月([0-9０-９]+)日", result)
        if result_match:
            result_month, result_day = (int(_digits(value)) for value in result_match.groups())
            result_year = int(start_year) + (result_month < int(_digits(start_month)))
            result_dates.append(f"{result_year}-{result_month:02d}-{result_day:02d}")
        evidence.append(" / ".join(cells))
    if not exam_dates or not result_dates:
        return []
    evidence_text = "\n".join(evidence)
    result: list[FPFactCandidate] = []
    for level in ("2", "3"):
        for component in ("academic", "practical:asset-design"):
            result.extend([
                _candidate(snapshot, "exam_dates", ",".join(exam_dates), "、".join(exam_dates), "jafp", level, component, "cbt", "json", evidence_text),
                _candidate(snapshot, "exam_schedule", ",".join(exam_dates), " / ".join(exam_dates), "jafp", level, component, "cbt", evidence=evidence_text),
                _candidate(snapshot, "result_date", ",".join(result_dates), "、".join(result_dates), "jafp", level, component, "cbt", "json", evidence_text),
            ])
    return result


def _extract_kinzai_1_academic(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    time_heading, format_heading, fee_heading = soup.select_one("#exam-time"), soup.select_one("#exam-format"), soup.select_one("#exam-fee")
    if not time_heading or not format_heading or not fee_heading:
        return []
    table = format_heading.find_next("table")
    if not table:
        return []
    format_text = table.get_text(" ", strip=True)
    # A CBT applicant portal is not evidence that the assessment itself is
    # CBT.  Prefer the explicit form in the exam-format table, which keeps the
    # 2026 level-1 academic written assessment in its PBT dimension.
    if "筆記試験" in format_text:
        delivery_mode, exam_method = "pbt", "PBT"
    elif "CBT方式" in format_text:
        delivery_mode, exam_method = "cbt", "CBT"
    else:
        return []
    result = [
        _candidate(snapshot, "exam_method", exam_method, exam_method, "kinzai", "1", "academic", delivery_mode, evidence=format_text),
        _candidate(snapshot, "exam_time", "300", "基礎編150分・応用編150分（合計300分）", "kinzai", "1", "academic", delivery_mode, "integer"),
        _candidate(snapshot, "passing_standard", "120/200", "120点以上（200点満点）", "kinzai", "1", "academic", delivery_mode),
    ]
    for row in table.select("tr")[1:]:
        cells = [cell.get_text(" ", strip=True) for cell in row.select("td")]
        if len(cells) < 3:
            continue
        section, form, count = cells[:3]
        component = "academic:basic" if section == "基礎編" else "academic:applied"
        result.append(_candidate(snapshot, "question_format", form, form, "kinzai", "1", component, delivery_mode, evidence=" / ".join(cells)))
        result.append(_candidate(snapshot, "question_count", re.sub(r"\D", "", count), count, "kinzai", "1", component, delivery_mode, "integer", " / ".join(cells)))
    fee_text = fee_heading.find_next("p").get_text(" ", strip=True)
    amount = re.sub(r"\D", "", fee_text)
    result.append(_candidate(snapshot, "fee", amount, fee_text, "kinzai", "1", "academic", delivery_mode, "money"))
    return result


def _extract_kinzai_1_practical(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    format_heading, fee_heading = soup.select_one("#syutudai"), soup.select_one("#exam-fee")
    if not format_heading or not fee_heading:
        return []
    assessment_heading = soup.select_one("#exam-format")
    assessment_block = assessment_heading.find_next("ul", class_="list") if assessment_heading else None
    subject_line = next(
        (
            item.get_text(" ", strip=True)
            for item in soup.select("li")
            if "資産相談業務" in item.get_text(" ", strip=True)
        ),
        soup.select_one("h1").get_text(" ", strip=True) if soup.select_one("h1") else "",
    )
    assessment_text = assessment_block.get_text(" ", strip=True) if assessment_block else ""
    fee_text = fee_heading.find_next("p").get_text(" ", strip=True)
    return [
        _candidate(snapshot, "practical_subject", "asset_consulting", "資産相談業務", "kinzai", "1", "practical:asset-consulting", "interview", evidence=subject_line),
        _candidate(snapshot, "exam_method", "interview", "対面の口述試験", "kinzai", "1", "practical:asset-consulting", "interview", evidence=assessment_text),
        _candidate(snapshot, "interview_count", "2", "面接2回", "kinzai", "1", "practical:asset-consulting", "interview", "integer", assessment_text),
        _candidate(snapshot, "exam_time", "12", "各面接 約12分", "kinzai", "1", "practical:asset-consulting", "interview", "integer", assessment_text),
        _candidate(snapshot, "question_format", "oral", "口頭試問方式", "kinzai", "1", "practical:asset-consulting", "interview"),
        _candidate(snapshot, "passing_standard", "120/200", "200点満点で120点以上", "kinzai", "1", "practical:asset-consulting", "interview"),
        _candidate(snapshot, "fee", re.sub(r"\D", "", fee_text), fee_text, "kinzai", "1", "practical:asset-consulting", "interview", "money"),
    ]


def _extract_kinzai_2026_schedule(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    """Keep every published level-1 occurrence in its own temporal value.

    Candidate identity remains one fact per field and dimension, so multiple
    occurrences are stored as a JSON-text sequence.  The public calendar
    expands every ISO date in that sequence into separate calendar/ICS events.
    """
    academic = soup.select_one("h2#g")
    practical = soup.select_one("h2#j")
    if not academic or not practical:
        return []

    def blocks(start: object) -> list[tuple[str, str]]:
        result: list[tuple[str, str]] = []
        heading = start.find_next("h4")
        while heading is not None:
            previous_h2 = heading.find_previous("h2")
            if previous_h2 is not start:
                break
            table = heading.find_next("table")
            if table is None or table.find_previous("h4") is not heading:
                break
            result.append((heading.get_text(" ", strip=True), table.get_text(" ", strip=True)))
            heading = heading.find_next("h4")
        return result

    def iso_dates(value: str) -> list[str]:
        found = re.findall(r"(202[67])年\s*([0-9０-９]+)月\s*([0-9０-９]+)日", value)
        return [f"{year}-{int(_digits(month)):02d}-{int(_digits(day)):02d}" for year, month, day in found]

    def application_window(table_text: str) -> tuple[str, str] | None:
        match = re.search(
            r"受検申請受付期間\s*(202[67])年\s*([0-9０-９]+)月\s*([0-9０-９]+)日[^～]*～\s*(?:(202[67])年\s*)?([0-9０-９]+)月\s*([0-9０-９]+)日[^0-9０-９]*([0-9０-９]+)[:：]([0-9０-９]+)",
            table_text,
        )
        if not match:
            return None
        start_year, start_month, start_day, end_year, end_month, end_day, end_hour, end_minute = match.groups()
        end_year = end_year or start_year
        start = f"{start_year}-{int(_digits(start_month)):02d}-{int(_digits(start_day)):02d}T10:00:00+09:00"
        end = f"{end_year}-{int(_digits(end_month)):02d}-{int(_digits(end_day)):02d}T{int(_digits(end_hour)):02d}:{int(_digits(end_minute)):02d}:00+09:00"
        return start, end

    def result_dates_from_table(table_text: str) -> list[str]:
        match = re.search(r"合格発表日（予定）\s*(202[67]年.*)", table_text)
        return iso_dates(match.group(1)) if match else []

    def schedule_candidates(component: str, mode: str, entries: list[tuple[str, str]]) -> list[FPFactCandidate]:
        exam_dates: list[str] = []
        application_opens: list[str] = []
        application_deadlines: list[str] = []
        published_result_dates: list[str] = []
        evidence: list[str] = []
        for heading, table_text in entries:
            evidence.append(f"{heading} / {table_text}")
            if "試験日" in heading:
                exam_dates.extend(iso_dates(heading))
            else:
                for row in table_text.split(" 試験日 ")[1:]:
                    exam_dates.extend(iso_dates(row.split(" 合格発表日", 1)[0]))
            application = application_window(table_text)
            if application:
                application_opens.append(application[0])
                application_deadlines.append(application[-1])
            published_result_dates.extend(result_dates_from_table(table_text))
        evidence_text = "\n".join(evidence)
        if not exam_dates:
            return []
        result = [
            _candidate(snapshot, "exam_dates", ",".join(dict.fromkeys(exam_dates)), "、".join(dict.fromkeys(exam_dates)), "kinzai", "1", component, mode, "json", evidence_text),
            _candidate(snapshot, "exam_schedule", ",".join(dict.fromkeys(exam_dates)), " / ".join(dict.fromkeys(exam_dates)), "kinzai", "1", component, mode, evidence=evidence_text),
        ]
        for key, values in (("application_open", application_opens), ("application_deadline", application_deadlines), ("result_date", published_result_dates)):
            if values:
                normalized = ",".join(dict.fromkeys(values))
                result.append(_candidate(snapshot, key, normalized, normalized, "kinzai", "1", component, mode, "json", evidence_text))
        return result

    return schedule_candidates("academic", "pbt", blocks(academic)) + schedule_candidates("practical:asset-consulting", "interview", blocks(practical))


def _extract_kinzai_eligibility(snapshot: FPSnapshot, soup: BeautifulSoup) -> list[FPFactCandidate]:
    """Extract the explicit level-1 academic/practical eligibility table.

    The registered page contains separate rows for 1級学科試験 and 1級実技試験.
    Their delivery modes are fixed by the corresponding registered 1級 outlines;
    no eligibility text is reused for another level or provider.
    """
    heading = soup.select_one("h2#aaa")
    table = heading.find_next("table") if heading else None
    if not table:
        return []
    requirements = {"academic": [], "practical": []}
    current: str | None = None
    for row in table.select("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if not cells:
            continue
        first = cells[0].get_text(" ", strip=True)
        if first == "学科試験":
            current = "academic"
            cells = cells[1:]
        elif first == "実技試験":
            current = "practical"
            cells = cells[1:]
        if current is None:
            continue
        requirements[current].extend(
            cell.get_text(" ", strip=True) for cell in cells if cell.name == "td"
        )
    academic = " / ".join(requirements["academic"])
    practical = " / ".join(requirements["practical"])
    result: list[FPFactCandidate] = []
    if academic:
        result.append(_candidate(
            snapshot,
            "eligibility",
            academic,
            academic,
            "kinzai",
            "1",
            "academic",
            "pbt",
            evidence=academic,
        ))
    if practical:
        result.append(_candidate(
            snapshot,
            "eligibility",
            practical,
            practical,
            "kinzai",
            "1",
            "practical:asset-consulting",
            "interview",
            evidence=practical,
        ))
    return result
