"""Offline-first adapter for Fundamental Information Technology (FE).

Only explicitly marked fields are accepted in fixtures. No concrete CBT dates,
fees, or eligibility are inferred from general IPA prose.
"""

from dataclasses import dataclass, replace
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
    # Work package F: IPA publishes the per-examination historical statistics
    # table here.  The index page itself carries only the two methodology
    # sentences; the numbers live in the attachments it links to.
    "source:fundamental-it:statistics-fe": {
        "canonical_url": "https://www.ipa.go.jp/shiken/reports/toukei_fe.html",
        "allowed_domain": "www.ipa.go.jp",
    },
    # Work package J (owner decisions D1=A, D2=fiscal start year, D3=令和7年度,
    # D5=methodology same batch): the 推移表 xlsx attachment behind the
    # statistics index.  The file name rolls monthly (202609_… at registration);
    # a rolled name is a URL-drift event, handled like 0026 for bookkeeping.
    "source:fundamental-it:statistics-fe-suiihyo": {
        "canonical_url": "https://www.ipa.go.jp/shiken/reports/ps6vr70000016ew6-att/202609_fe_01_suiihyo.xlsx",
        "allowed_domain": "www.ipa.go.jp",
    },
    # Shared 情報処理技術者試験 fee page; the 7,500円 statement is category-level.
    "source:fundamental-it:ipa-fee": {
        "canonical_url": "https://www.ipa.go.jp/shiken/mousikomi/schedule.html",
        "allowed_domain": "www.ipa.go.jp",
    },
    # CBT operator portal: eligibility and pass criteria for the CBT delivery.
    # The former /cbt/fe/ page now 301s to the corporate top; the FE page lives
    # under the examinee portal and returns 200 without redirects.
    "source:fundamental-it:cbt-s": {
        "canonical_url": "https://www.cbt-s.com/examinee/examination/fe",
        "allowed_domain": "www.cbt-s.com",
    },
    # 試験要綱 PDF: the only official statement that FE scoring uses IRT.
    "source:fundamental-it:youkou-pdf": {
        "canonical_url": "https://www.ipa.go.jp/shiken/syllabus/rcu1hd00000141gq-att/youkou_ver5_6.pdf",
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
    normalized_value: str | dict[str, str]
    display_value: str
    source_id: str
    source_snapshot_id: str
    risk_level: str = "high"
    status: str = "pending_review"
    synthetic: bool = True
    evidence_text: str | None = None
    value_type: str = "text"
    delivery_mode: str | None = "cbt"
    exam_component: str | None = None
    # Statistics rows carry their own coverage year (fiscal start year, owner
    # decision D2); None keeps the ingest-time exam_year fallback.
    exam_year: int | None = None


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
    if snapshot.source_id == "source:fundamental-it:cbt":
        candidates.extend(_extract_cbt_page(snapshot))
    if snapshot.source_id == "source:fundamental-it:ipa-fee":
        candidates.extend(_extract_fee_page(snapshot))
    if snapshot.source_id == "source:fundamental-it:cbt-s":
        candidates.extend(_extract_cbt_s_page(snapshot))
    if snapshot.source_id == "source:fundamental-it:statistics-fe":
        candidates.extend(_extract_statistics_index_page(snapshot))
    if not candidates:
        return [], (FundamentalITParseIssue("structure_changed", "no supported official fields found"),)
    return [replace(candidate, exam_component=_subject_component(candidate.fact_key)) for candidate in candidates], ()


def _subject_component(fact_key: str) -> str | None:
    match = re.match(r"exam_subject_([ab])_", fact_key)
    return f"subject-{match.group(1)}" if match else None


def _extract_cbt_s_page(snapshot: FundamentalITSnapshot) -> list[FundamentalITFactCandidate]:
    """Read eligibility and pass criteria from the CBT operator portal.

    Only the two rows IPA does not publish are taken; subject timing and
    question counts stay with the IPA exam page.
    """
    soup = BeautifulSoup(snapshot.html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if "基本情報技術者試験" not in title:
        return []
    rows = {}
    for row in soup.select("tr"):
        header = row.find("th")
        value = row.find("td")
        if header and value:
            rows.setdefault(header.get_text(" ", strip=True), value.get_text(" ", strip=True))
    candidates: list[FundamentalITFactCandidate] = []
    eligibility = rows.get("受験資格", "")
    if eligibility == "どなたでも受験可能":
        candidates.append(
            FundamentalITFactCandidate(
                "eligibility", eligibility, eligibility, snapshot.source_id,
                snapshot.content_hash, risk_level="high",
                synthetic=snapshot.synthetic, evidence_text=eligibility,
            )
        )
    passing = rows.get("合格基準", "")
    match = re.search(r"各科目の評価点が基準点（600点）以上の場合に合格です。", passing)
    if match:
        candidates.append(
            FundamentalITFactCandidate(
                "passing_standard",
                "各科目の評価点が基準点（600点）以上",
                "各科目の評価点が600点以上",
                snapshot.source_id,
                snapshot.content_hash,
                risk_level="high",
                synthetic=snapshot.synthetic,
                evidence_text=match.group(0),
            )
        )
    return candidates


_STATISTICS_INDEX_SENTENCES = (
    "令和5年度以降の基本情報技術者試験の統計情報を掲載しています。",
    "応募者の方々に受験申込時に記入していただいたアンケートに基づいた情報です。",
)


def _extract_statistics_index_page(snapshot: FundamentalITSnapshot) -> list[FundamentalITFactCandidate]:
    """Read only the two printed methodology sentences of the statistics index.

    The index page is an attachment directory with zero in-page tables.  Owner
    decision D5 takes its two documented statements as statistics_methodology;
    the numeric fields come from the 推移表 xlsx attachment instead.  A missing
    sentence yields no candidate, never a paraphrase.
    """
    text = re.sub(
        r"\s+", "", BeautifulSoup(snapshot.html, "html.parser").get_text(" ", strip=True)
    )
    if not all(sentence in text for sentence in _STATISTICS_INDEX_SENTENCES):
        return []
    evidence = "".join(_STATISTICS_INDEX_SENTENCES)
    return [
        FundamentalITFactCandidate(
            "statistics_methodology",
            evidence,
            evidence,
            snapshot.source_id,
            snapshot.content_hash,
            risk_level="high",
            synthetic=snapshot.synthetic,
            evidence_text=evidence,
            value_type="text",
        )
    ]


def _extract_fee_page(snapshot: FundamentalITSnapshot) -> list[FundamentalITFactCandidate]:
    """Read the shared 情報処理技術者試験 fee statement, including FE.

    The amount is stated for 情報処理技術者試験 as a category; FE is one of
    those exams, so no per-exam price is inferred.  A missing statement yields
    no candidate.
    """
    soup = BeautifulSoup(snapshot.html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    if "スケジュール" not in title:
        return []
    text = soup.get_text(" ", strip=True).translate(
        str.maketrans("０１２３４５６７８９（）", "0123456789()")
    )
    match = re.search(r"受験手数料\s*7,500円\([^)]*\)", text)
    if not match:
        return []
    evidence = match.group(0)
    return [
        FundamentalITFactCandidate(
            "fee",
            "7500",
            "7,500円",
            snapshot.source_id,
            snapshot.content_hash,
            risk_level="high",
            synthetic=snapshot.synthetic,
            evidence_text=evidence,
            value_type="integer",
        )
    ]


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


def _extract_cbt_page(snapshot: FundamentalITSnapshot) -> list[FundamentalITFactCandidate]:
    """Extract only the FE-specific, explicit CBT delivery statement.

    The page is shared with the security-management exam and contains a
    month-by-month results table.  Those rows cannot be safely attributed to
    a single annual FE fact without another dimension, so this adapter emits
    only the unambiguous shared delivery and schedule statements.
    """
    text = BeautifulSoup(snapshot.html, "html.parser").get_text(" ", strip=True)
    if "基本情報技術者試験（FE）は、CBT（Computer Based Testing）方式により実施しています" not in text:
        return []
    evidence = "基本情報技術者試験（FE）は、CBT（Computer Based Testing）方式により実施しています。"
    candidates = [
        FundamentalITFactCandidate(
            "exam_method", "CBT", "CBT方式", snapshot.source_id, snapshot.content_hash,
            risk_level="medium", synthetic=snapshot.synthetic, evidence_text=evidence,
        )
    ]
    if "令和5年度から年間を通じてCBT方式で随時試験を実施しています" in text:
        candidates.append(FundamentalITFactCandidate(
            "exam_schedule", "year_round", "年間を通じて随時実施", snapshot.source_id,
            snapshot.content_hash, risk_level="medium", synthetic=snapshot.synthetic,
            evidence_text="令和5年度から年間を通じてCBT方式で随時試験を実施しています。",
        ))
    suspension = _extract_suspension_period(snapshot, text)
    if suspension is not None:
        candidates.append(suspension)
    return candidates


_SUSPENSION_START = re.compile(r"(\d{4})年(\d{1,2})月(\d{1,2})日から試験実施を一時休止")
_SUSPENSION_RESUME = re.compile(r"試験再開は、?(\d{4})年(\d{1,2})月(上旬|中旬|下旬)を予定")
_RESUME_PERIODS = {"上旬": "early", "中旬": "mid", "下旬": "late"}


def _sentence_at(text: str, index: int) -> str:
    left = text.rfind("。", 0, index) + 1
    right = text.find("。", index)
    if right == -1:
        return text[left:].strip()
    return text[left:right + 1].strip()


def _extract_suspension_period(
    snapshot: FundamentalITSnapshot, text: str
) -> FundamentalITFactCandidate | None:
    """Record the repair suspension only when both dates are stated and planned.

    The notice says the suspension starts on a concrete day and that the resume
    is planned for late January; neither is inferred.  A missing sentence, an
    unstated year, or a resume without 「予定」 yields no candidate.
    """
    start = _SUSPENSION_START.search(text)
    resume = _SUSPENSION_RESUME.search(text)
    if not start or not resume:
        return None
    start_year, start_month, start_day = (int(part) for part in start.groups())
    if not 1 <= start_month <= 12 or not 1 <= start_day <= 31:
        return None
    start_date = f"{start_year:04d}-{start_month:02d}-{start_day:02d}"
    resume_year, resume_month, resume_part = int(resume.group(1)), int(resume.group(2)), resume.group(3)
    if not 1 <= resume_month <= 12:
        return None
    start_sentence = _sentence_at(text, start.start())
    resume_sentence = _sentence_at(text, resume.start())
    if not start_sentence or not resume_sentence:
        return None
    return FundamentalITFactCandidate(
        "suspension_period",
        {"startsOn": start_date, "resumesFrom": f"{resume_year:04d}-{resume_month:02d}-{_RESUME_PERIODS[resume_part]}"},
        f"{start_year}年{start_month}月{start_day}日～{resume_year}年{resume_month}月{resume_part}（予定）実施休止",
        snapshot.source_id,
        snapshot.content_hash,
        risk_level="high",
        synthetic=snapshot.synthetic,
        evidence_text=f"{start_sentence}{resume_sentence}",
        value_type="json",
    )


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
