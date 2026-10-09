"""Offline-first adapter for the registered 行政書士 official pages."""

from dataclasses import dataclass
from hashlib import sha256
import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from collector.http_policy import SafeFetcher


GYoseishoshi_SOURCES = {
    "source:gyoseishoshi:home": {
        "canonical_url": "https://www.gyosei-shiken.or.jp/",
        "allowed_domain": "www.gyosei-shiken.or.jp",
    },
    "source:gyoseishoshi:abstract": {
        "canonical_url": "https://www.gyosei-shiken.or.jp/doc/abstract/abstract.html",
        "allowed_domain": "www.gyosei-shiken.or.jp",
    },
    "source:gyoseishoshi:guide": {
        "canonical_url": "https://www.gyosei-shiken.or.jp/doc/guide/guide.html",
        "allowed_domain": "www.gyosei-shiken.or.jp",
    },
}


@dataclass(frozen=True)
class GyoseishoshiSnapshot:
    source_id: str
    content_hash: str
    html: str
    synthetic: bool = True


@dataclass(frozen=True)
class GyoseishoshiFactCandidate:
    fact_key: str
    normalized_value: str
    display_value: str
    source_id: str
    source_snapshot_id: str
    risk_level: str = "high"
    status: str = "pending_review"
    synthetic: bool = True
    value_type: str = "text"
    evidence_text: str | None = None


@dataclass(frozen=True)
class GyoseishoshiParseIssue:
    code: str
    message: str


def snapshot_from_html(source_id: str, html: str, *, synthetic: bool = True) -> GyoseishoshiSnapshot:
    if source_id not in GYoseishoshi_SOURCES:
        raise ValueError(f"unregistered 行政書士 source: {source_id}")
    if not html.strip():
        raise ValueError("snapshot HTML must not be empty")
    return GyoseishoshiSnapshot(source_id, sha256(html.encode("utf-8")).hexdigest(), html, synthetic)


def extract_candidates(
    snapshot: GyoseishoshiSnapshot,
) -> tuple[list[GyoseishoshiFactCandidate], tuple[GyoseishoshiParseIssue, ...]]:
    soup = BeautifulSoup(snapshot.html, "html.parser")
    fields = {
        node.get("data-fact-key", "").strip(): node.get_text(" ", strip=True)
        for node in soup.select("[data-fact-key]")
        if node.get("data-fact-key", "").strip() and node.get_text(" ", strip=True)
    }
    candidates = [
        GyoseishoshiFactCandidate(
            key, value, value, snapshot.source_id, snapshot.content_hash,
            synthetic=snapshot.synthetic,
        )
        for key, value in fields.items()
    ]
    if snapshot.source_id == "source:gyoseishoshi:guide":
        candidates.extend(_extract_guide_candidates(snapshot))
    if not candidates:
        return [], (GyoseishoshiParseIssue("structure_changed", "no supported official fields found"),)
    return candidates, ()


def _extract_guide_candidates(
    snapshot: GyoseishoshiSnapshot,
) -> list[GyoseishoshiFactCandidate]:
    """Extract only labelled fields from the official annual guide."""
    soup = BeautifulSoup(snapshot.html, "html.parser")
    text = soup.get_text(" ", strip=True)
    result: list[GyoseishoshiFactCandidate] = []

    def add(key: str, normalized: str, display: str, value_type: str, evidence: str) -> None:
        result.append(GyoseishoshiFactCandidate(
            key, normalized, display, snapshot.source_id, snapshot.content_hash,
            synthetic=snapshot.synthetic, value_type=value_type, evidence_text=evidence,
        ))

    row_values = {
        row.find("th").get_text(" ", strip=True): row.find("td").get_text(" ", strip=True)
        for row in soup.select("table.info-table tr")
        if row.find("th") is not None and row.find("td") is not None
    }

    if "受験資格" in row_values:
        add("eligibility", "open_to_all", row_values["受験資格"], "text", f"受験資格 {row_values['受験資格']}")

    if "試験日" in row_values:
        match = re.search(r"令和([0-9０-９]+)年\s*([0-9０-９]+)月\s*([0-9０-９]+)日（([^）]+)）", row_values["試験日"])
        if match:
            reiwa, month, day = (_digits(x) for x in match.group(1, 2, 3))
            year = 2018 + int(reiwa)
            add("exam_date", f"{year:04d}-{int(month):02d}-{int(day):02d}", match.group(0), "date", f"試験日 {row_values['試験日']}")

    if "申込期間" in row_values:
        match = re.search(r"令和([0-9０-９]+)年\s*([0-9０-９]+)月\s*([0-9０-９]+)日.*?令和([0-9０-９]+)年\s*([0-9０-９]+)月\s*([0-9０-９]+)日.*?午後([0-9０-９]+)時", row_values["申込期間"])
        if match:
            values = [_digits(x) for x in match.group(1, 2, 3, 4, 5, 6, 7)]
            _, _, _, end_y, end_m, end_d, hour = map(int, values)
            if hour < 12:
                hour += 12
            add("application_deadline", f"{2018 + end_y:04d}-{end_m:02d}-{end_d:02d}T{hour:02d}:00:00+09:00", row_values["申込期間"], "datetime", f"申込期間 {row_values['申込期間']}")

    if "受験手数料" in row_values:
        match = re.search(r"([0-9０-９,，]+)円", row_values["受験手数料"])
        if match:
            amount = int(_digits(match.group(1)).replace(",", ""))
            add("fee", str(amount), match.group(0), "money", f"受験手数料 {row_values['受験手数料']}")

    eligibility = re.search(r"受験資格\s*(年齢、学歴、国籍等に関係なく、どなたでも受験できます。?)", text)
    if eligibility and not any(x.fact_key == "eligibility" for x in result):
        add("eligibility", "open_to_all", eligibility.group(1), "text", eligibility.group(0))

    exam_date = re.search(r"試験日\s*令和([0-9０-９]+)年\s*([0-9０-９]+)月\s*([0-9０-９]+)日（([^）]+)）", text)
    if exam_date and not any(x.fact_key == "exam_date" for x in result):
        reiwa, month, day = (_digits(x) for x in exam_date.group(1, 2, 3))
        year = 2018 + int(reiwa)
        display = exam_date.group(0)
        add("exam_date", f"{year:04d}-{int(month):02d}-{int(day):02d}", display, "date", display)

    deadline = re.search(r"インターネットによる受験申込み.*?受付期間\s*令和([0-9０-９]+)年\s*([0-9０-９]+)月\s*([0-9０-９]+)日[^令]*?から令和([0-9０-９]+)年\s*([0-9０-９]+)月\s*([0-9０-９]+)日（[^）]+）\s*午後([0-9０-９]+)時まで", text)
    if deadline and not any(x.fact_key == "application_deadline" for x in result):
        values = [_digits(x) for x in deadline.group(1, 2, 3, 4, 5, 6, 7)]
        start_y, start_m, start_d, end_y, end_m, end_d, hour = map(int, values)
        if "午後" in deadline.group(0) and hour < 12:
            hour += 12
        display = deadline.group(0)
        add("application_deadline", f"{2018 + end_y:04d}-{end_m:02d}-{end_d:02d}T{hour:02d}:00:00+09:00", display, "datetime", display)

        add("application_open", f"{2018 + start_y:04d}-{start_m:02d}-{start_d:02d}T09:00:00+09:00", display, "datetime", display)

    application_open = re.search(
        r"インターネットによる受験申込み.*?令和([0-9０-９]+)年\s*([0-9０-９]+)月\s*([0-9０-９]+)日（[^）]+）\s*午前([0-9０-９]+)時\s*(?:から|～)",
        text,
    )
    if application_open and not any(x.fact_key == "application_open" for x in result):
        year, month, day, hour = (int(_digits(value)) for value in application_open.group(1, 2, 3, 4))
        evidence = application_open.group(0)
        add("application_open", f"{2018 + year:04d}-{month:02d}-{day:02d}T{hour:02d}:00:00+09:00", evidence, "datetime", evidence)

    application_methods = re.search(
        r"受験申込みには「(インターネットによる受験申込み)」と「(郵送による受験申込み)」の２つの方法があります。",
        text,
    )
    if application_methods:
        display = application_methods.group(0)
        add("application_method", "インターネットによる受験申込み・郵送による受験申込み", display, "text", display)

    fee = re.search(r"受験手数料は\s*([0-9０-９,，]+)円", text)
    if fee and not any(x.fact_key == "fee" for x in result):
        amount = int(_digits(fee.group(1)).replace(",", ""))
        add("fee", str(amount), fee.group(0), "money", fee.group(0))

    method = re.search(r"試験方法\s*試験は、([^。]+。)", text)
    if method and not any(x.fact_key == "exam_method" for x in result):
        add("exam_method", method.group(1), method.group(0), "text", method.group(0))

    exam_time = re.search(r"試験時間\s*午後([0-9０-９]+)時から午後([0-9０-９]+)時まで", text)
    if exam_time:
        start_hour, end_hour = (int(_digits(value)) for value in exam_time.group(1, 2))
        duration = (end_hour - start_hour) * 60
        display = exam_time.group(0)
        add("exam_time", str(duration), display, "integer", display)

    subject_rows = [
        row.get_text(" ", strip=True)
        for row in soup.select("table.info-table tr")
        if "出題数" in row.get_text(" ", strip=True)
    ]
    laws_subject = next((row for row in subject_rows if "必要な法令等" in row), None)
    basic_subject = next((row for row in subject_rows if "必要な基礎知識" in row), None)
    if laws_subject and basic_subject:
        laws_count_match = re.search(r"出題数([０-９0-9]+)題", laws_subject)
        basic_count_match = re.search(r"出題数([０-９0-9]+)題", basic_subject)
        if laws_count_match is not None and basic_count_match is not None:
            laws_count, basic_count = (int(_digits(match.group(1))) for match in (laws_count_match, basic_count_match))
            evidence = f"{laws_subject} / {basic_subject}"
            add("exam_subjects", "行政書士の業務に関し必要な法令等・行政書士の業務に関し必要な基礎知識", evidence, "text", evidence)
            add("question_count", str(laws_count + basic_count), evidence, "integer", evidence)

    question_format = re.search(r"出題の形式は、([^。]+。)\s*記述式は、([^。]+。)", text)
    if question_format:
        evidence = question_format.group(0)
        add("question_format", "択一式・記述式", evidence, "text", evidence)

    result_date = re.search(r"合格発表は、令和([0-9０-９]+)年([0-9０-９]+)月([0-9０-９]+)日（[^）]+）午前９時から", text)
    if result_date:
        year, month, day = (int(_digits(value)) for value in result_date.group(1, 2, 3))
        evidence = result_date.group(0)
        add("result_date", f"{2018 + year:04d}-{month:02d}-{day:02d}", evidence, "date", evidence)

    passing_standard = re.search(
        r"次の要件のいずれも満たした者を合格とします。\s*①\s*([^②]+)\s*②\s*([^③]+)\s*③\s*([^（]+パーセント以上である者)",
        text,
    )
    if passing_standard:
        evidence = passing_standard.group(0)
        add("passing_standard", "法令等50%以上・基礎知識40%以上・全体60%以上", evidence, "text", evidence)

    scoring_method = re.search(r"択一式問題の採点を完了した段階で合格基準を満たしていないと認められる場合には、記述式問題の採点を行わないことがあります。", text)
    if scoring_method:
        evidence = scoring_method.group(0)
        add("scoring_method", "択一式が合格基準未達の場合は記述式を採点しないことがある", evidence, "text", evidence)
    return result


def _digits(value: str) -> str:
    return value.translate(str.maketrans("０１２３４５６７８９，", "0123456789,"))


def fetch_gyoseishoshi_snapshot(fetcher: SafeFetcher, source_id: str) -> GyoseishoshiSnapshot | None:
    source = GYoseishoshi_SOURCES.get(source_id)
    if source is None:
        raise ValueError(f"unregistered 行政書士 source: {source_id}")
    result = fetcher.fetch(source["canonical_url"])
    if result.status not in {"ok", "not_modified"} or result.body is None:
        return None
    return snapshot_from_html(source_id, result.body.decode("utf-8", errors="strict"), synthetic=False)


def is_registered_source_url(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.scheme == "https" and any(parsed.hostname == source["allowed_domain"] for source in GYoseishoshi_SOURCES.values())


def source_plan() -> tuple[dict[str, str], ...]:
    return tuple({"id": source_id, **details} for source_id, details in GYoseishoshi_SOURCES.items())
