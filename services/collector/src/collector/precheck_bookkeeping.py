"""Read-only pre-ingest verification for the bookkeeping candidate chain.

Staging the history candidates turns the release gate hard-red the moment they
land, and several prerequisites can fail before that is even reachable: 0017 not
applied, a source id missing from ``sources`` (``snapshots.source_id`` is a
foreign key), or on-disk bytes that no longer match the capture report.  This
module answers one question before any write is issued: would ingest produce
exactly the candidate ids we reproduce offline, and can the database accept them?

It only ever SELECTs.  The CLI exits 1 when a blocking finding is present, so a
real ingest can be gated on it.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path

import psycopg

from collector.bookkeeping import extract_candidates, snapshot_from_bytes
from collector.ingest_bookkeeping import (
    DEFAULT_EXAM_YEAR,
    INGEST_SOURCES,
    QUALIFICATION_ID,
    SNAPSHOT_ROOT,
    approved_value_keys,
    candidate_id,
    capture_record,
    value_key,
)

SESSION_COLUMN = "exam_session"


@dataclass(frozen=True)
class Finding:
    code: str
    source_id: str
    detail: str
    blocking: bool = True

    def format(self) -> str:
        return f"[{'BLOCK' if self.blocking else 'info '}] {self.code} {self.source_id}: {self.detail}"


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)
    stored_ids: int = 0
    computed_ids: int = 0
    skipped_approved: int = 0
    would_stage: int = 0

    def add(self, code: str, source_id: str, detail: str, *, blocking: bool = True) -> None:
        self.findings.append(Finding(code, source_id, detail, blocking))

    @property
    def blocking(self) -> list[Finding]:
        return [finding for finding in self.findings if finding.blocking]

    def summary(self) -> str:
        return (
            f"summary: stored={self.stored_ids} computed={self.computed_ids} "
            f"skipped_approved={self.skipped_approved} would_stage={self.would_stage} "
            f"blocking={len(self.blocking)}"
        )


def planned_rows(snapshot_bytes: bytes, source_id: str, snapshot_hash: str) -> tuple[dict[str, tuple], list[str]]:
    """Recompute the rows ingest would write, with the writer's own id formula.

    Keys are candidate ids, values are the dedup keys ``approved_value_keys`` uses,
    so a value already approved on an earlier generation is recognised here too.
    """
    snapshot = snapshot_from_bytes(source_id, snapshot_bytes, synthetic=False)
    candidates, issues = extract_candidates(snapshot)
    planned: dict[str, tuple] = {}
    for candidate in candidates:
        year = DEFAULT_EXAM_YEAR if candidate.exam_year is None else candidate.exam_year
        payload = json.dumps(
            [
                candidate.fact_key,
                candidate.value_type,
                candidate.normalized_value,
                candidate.display_value,
                candidate.evidence_text,
            ],
            ensure_ascii=False,
        )
        digest = hashlib.sha256(payload.encode()).hexdigest()[:12]
        planned[
            candidate_id(
                snapshot_hash,
                candidate.exam_level_id,
                candidate.delivery_mode,
                candidate.fact_key,
                digest,
                candidate.exam_session,
            )
        ] = value_key(
            candidate.fact_key,
            candidate.exam_level_id,
            candidate.delivery_mode,
            candidate.exam_session,
            year,
            candidate.normalized_value,
            candidate.display_value,
        )
    return planned, [issue.code for issue in issues]


def approved_keys(cursor, *, session_column_present: bool) -> set[tuple]:
    """The writer's skip guard: approved values never re-enter the review queue."""
    if session_column_present:
        return approved_value_keys(cursor)
    cursor.execute(
        """SELECT fact_key, exam_level_id, delivery_mode, exam_year,
                  normalized_value::text, display_value
        FROM candidate_facts
        WHERE qualification_id=%s AND status='approved' AND synthetic=false""",
        (QUALIFICATION_ID,),
    )
    return {
        value_key(row[0], row[1], row[2], None, row[3], json.loads(row[4]), row[5])
        for row in cursor.fetchall()
    }


def check_source(cursor, report: Report, approved: set[tuple], filename: str, source_id: str) -> None:
    path = SNAPSHOT_ROOT / filename
    if cursor.execute("SELECT 1 FROM sources WHERE id=%s", (source_id,)).fetchone() is None:
        report.add(
            "unregistered_source",
            source_id,
            "no row in sources; snapshots.source_id is a foreign key so ingest would abort",
        )

    if not path.is_file():
        report.add("snapshot_missing", source_id, f"{path} is not on disk")
        return
    body = path.read_bytes()
    disk_hash = hashlib.sha256(body).hexdigest()
    try:
        record = capture_record(source_id, path)
    except ValueError as error:
        report.add("capture_record_invalid", source_id, str(error))
        return
    capture_hash = str(record["content_hash"])
    if capture_hash != disk_hash:
        report.add(
            "hash_mismatch",
            source_id,
            f"on-disk sha256 {disk_hash[:12]} is not the captured generation {capture_hash[:12]}",
        )
        return

    planned, issue_codes = planned_rows(body, source_id, disk_hash)
    if issue_codes:
        report.add("parse_failed", source_id, "extract_candidates reported " + ", ".join(issue_codes))
    current_generation = f"snapshot:bookkeeping:{disk_hash}"
    stored_current = {
        row[0]
        for row in cursor.execute(
            """SELECT id FROM candidate_facts
            WHERE qualification_id=%s AND source_id=%s AND source_snapshot_id=%s""",
            (QUALIFICATION_ID, source_id, current_generation),
        ).fetchall()
    }
    stored_total = cursor.execute(
        """SELECT count(*)::int FROM candidate_facts
        WHERE qualification_id=%s AND source_id=%s""",
        (QUALIFICATION_ID, source_id),
    ).fetchone()[0]
    # Rows from earlier captures legitimately stay in candidate_facts as history;
    # only a row claiming to be this generation that the code cannot reproduce is drift.
    unreproduced = sorted(stored_current - set(planned))
    if unreproduced:
        report.add(
            "id_drift",
            source_id,
            f"{len(unreproduced)} of {len(stored_current)} ids stored for this generation are not reproduced, first={unreproduced[0]}",
        )
    skipped = {row_id for row_id, key in planned.items() if key in approved}
    fresh = sorted(set(planned) - skipped)
    if fresh:
        foreign = {
            row[0]
            for row in cursor.execute(
                "SELECT id FROM candidate_facts WHERE id = ANY(%s)", (fresh,)
            ).fetchall()
        }
        if foreign:
            report.add(
                "id_collision",
                source_id,
                f"{len(foreign)} computed ids already exist in candidate_facts, first={sorted(foreign)[0]}",
            )
    report.stored_ids += stored_total
    report.computed_ids += len(planned)
    report.skipped_approved += len(skipped)
    report.would_stage += len(fresh)
    report.add(
        "staged_delta",
        source_id,
        f"stored={stored_total} (other generations={stored_total - len(stored_current)}) "
        f"computed={len(planned)} skipped_approved={len(skipped)} would_stage={len(fresh)}",
        blocking=False,
    )


def run(database_url: str) -> Report:
    report = Report()
    with closing(psycopg.connect(database_url, connect_timeout=5)) as connection:
        with connection.cursor() as cursor:
            session_column_present = (
                cursor.execute(
                    """SELECT 1 FROM information_schema.columns
                    WHERE table_name='candidate_facts' AND column_name=%s""",
                    (SESSION_COLUMN,),
                ).fetchone()
                is not None
            )
            approved = approved_keys(cursor, session_column_present=session_column_present)
            if not session_column_present:
                report.add(
                    "session_column_absent",
                    "-",
                    f"candidate_facts has no {SESSION_COLUMN}; apply migration 0017 before ingest",
                )
            for filename, source_id in INGEST_SOURCES.items():
                check_source(cursor, report, approved, filename, source_id)
    return report


def main(argv: list[str] | None = None) -> int:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 2
    report = run(database_url)
    for finding in report.findings:
        print(finding.format())
    print(report.summary())
    print(
        "note: every would_stage row is a non-synthetic pending_review candidate, "
        "which the release gate treats as a hard failure until it is reviewed."
    )
    return 1 if report.blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
