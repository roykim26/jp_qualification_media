from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import re
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from collector.http_policy import SafeFetcher


TAKKEN_SOURCE = {
    "id": "source:takken:retio-exam",
    "canonical_url": "https://www.retio.or.jp/exam/",
    "allowed_domain": "www.retio.or.jp",
    "synthetic": False,
}


@dataclass(frozen=True)
class TakkenSnapshot:
    source_id: str
    content_hash: str
    html: str
    synthetic: bool = True


@dataclass(frozen=True)
class TakkenFactCandidate:
    fact_key: str
    exam_year: int
    normalized_value: str
    display_value: str
    source_id: str
    source_snapshot_id: str
    risk_level: str = "high"
    status: str = "pending_review"
    synthetic: bool = True


def snapshot_from_html(html: str, *, synthetic: bool = True) -> TakkenSnapshot:
    if not html.strip():
        raise ValueError("snapshot HTML must not be empty")
    return TakkenSnapshot(
        source_id=TAKKEN_SOURCE["id"],
        content_hash=sha256(html.encode("utf-8")).hexdigest(),
        html=html,
        synthetic=synthetic,
    )


def extract_target_fields(snapshot: TakkenSnapshot) -> dict[str, str]:
    """Parse only explicitly supported fixture fields; never invent missing values."""
    # html.parser keeps the fixture adapter runnable without requiring a native lxml build.
    soup = BeautifulSoup(snapshot.html, "html.parser")
    return {node["data-fact-key"]: node.get_text(strip=True) for node in soup.select("[data-fact-key]")}


def extract_navigation_links(snapshot: TakkenSnapshot) -> dict[str, str]:
    """Return only same-host registered navigation targets; no facts are inferred."""
    soup = BeautifulSoup(snapshot.html, "html.parser")
    targets = {
        "/exam/schedule/": "schedule",
        "/exam/exam_detail": "exam_overview",
        "/exam/faq/": "faq",
        "/exam/past_ques_ans/other/": "past_questions",
    }
    result: dict[str, str] = {}
    for link in soup.select("a[href]"):
        absolute = urljoin(TAKKEN_SOURCE["canonical_url"], link["href"])
        parsed = urlsplit(absolute)
        if parsed.hostname != TAKKEN_SOURCE["allowed_domain"]:
            continue
        key = targets.get(parsed.path)
        if key:
            result[key] = absolute
    return result


def _normalize_digits(value: str) -> str:
    return value.translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def _exam_year(text: str) -> int | None:
    match = re.search(r"令和\s*([0-9０-９]+)年?度?", _normalize_digits(text))
    return 2018 + int(match.group(1)) if match else None


def _parse_dates(text: str, default_year: int) -> list[tuple[datetime, str]]:
    normalized = _normalize_digits(text).replace("（", "(").replace("）", ")")
    pattern = re.compile(
        r"(?:令和\s*(?P<reiwa>\d+)年)?(?P<month>\d{1,2})月(?P<day>\d{1,2})日"
        r"(?:\([^)]*\))?\s*(?P<ampm>午前|午後)?(?P<hour>\d{1,2})?時?(?P<minute>\d{1,2})?分?"
    )
    values: list[tuple[datetime, str]] = []
    for match in pattern.finditer(normalized):
        year = 2018 + int(match.group("reiwa")) if match.group("reiwa") else default_year
        hour = int(match.group("hour") or 0)
        minute = int(match.group("minute") or 0)
        if match.group("ampm") == "午後" and hour < 12:
            hour += 12
        if match.group("ampm") == "午前" and hour == 12:
            hour = 0
        try:
            value = datetime(year, int(match.group("month")), int(match.group("day")), hour, minute, tzinfo=timezone(timedelta(hours=9)))
        except ValueError:
            continue
        values.append((value, match.group(0)))
    return values


def extract_schedule_candidates(snapshot: TakkenSnapshot) -> list[TakkenFactCandidate]:
    """Extract only explicitly labelled schedule dates as high-risk review candidates."""
    soup = BeautifulSoup(snapshot.html, "html.parser")
    full_text = soup.get_text(" ", strip=True)
    year = _exam_year(full_text)
    if year is None:
        return []
    headings = soup.select("h2, h3, h4")
    candidates: list[TakkenFactCandidate] = []
    labels = {
        "インターネット申込み": ("application_open_online", "application_deadline_online"),
        "郵送申込み及び試験案内（郵送申込み用）の配布": ("application_open_postal", "application_deadline_postal"),
        "試験日時": ("exam_date",),
        "合格発表": ("result_date",),
    }
    for index, heading in enumerate(headings):
        label = heading.get_text(" ", strip=True)
        fact_keys = next((keys for key, keys in labels.items() if key in label), ())
        if not fact_keys:
            continue
        section_parts: list[str] = []
        for sibling in heading.next_siblings:
            if getattr(sibling, "name", None) in {"h2", "h3", "h4"}:
                break
            section_parts.append(getattr(sibling, "get_text", lambda *args, **kwargs: str(sibling))(" ", strip=True))
        dates = _parse_dates(" ".join(section_parts), year)
        for fact_key, (value, display) in zip(fact_keys, dates):
            candidates.append(TakkenFactCandidate(fact_key, year, value.isoformat(), display, snapshot.source_id, snapshot.content_hash, synthetic=snapshot.synthetic))
    return candidates


def fetch_takken_snapshot(fetcher: SafeFetcher) -> TakkenSnapshot | None:
    """Fetch only through the policy layer; failures never become snapshots."""
    result = fetcher.fetch(TAKKEN_SOURCE["canonical_url"])
    if result.status not in {"ok", "not_modified"} or result.body is None:
        return None
    return snapshot_from_html(result.body.decode("utf-8", errors="strict"), synthetic=False)
