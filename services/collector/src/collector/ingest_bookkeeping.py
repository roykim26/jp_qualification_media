"""Explicit localhost-only ingest for captured 日商簿記 snapshots."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.bookkeeping import extract_candidates, snapshot_from_bytes

QUALIFICATION_ID = "qualification:bookkeeping"
SNAPSHOT_ROOT = Path("var/official-snapshots/bookkeeping").resolve()


def capture_record(source_id: str, snapshot_path: Path) -> dict[str, object]:
    report_path = SNAPSHOT_ROOT / "capture-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    record = next(
        (item for item in report.get("results", []) if item.get("source_id") == source_id),
        None,
    )
    if not record or record.get("status") != "ok" or record.get("status_code") != 200:
        raise ValueError(f"capture report has no successful record for {source_id}")
    if Path(str(record.get("snapshot_path", ""))).resolve() != snapshot_path:
        raise ValueError("capture report snapshot path does not match ingest path")
    if not isinstance(record.get("content_hash"), str) or not isinstance(record.get("captured_at"), str):
        raise ValueError("capture report lacks hash or timestamp")
    return record


def value_key(
    fact_key: str,
    exam_level_id: str | None,
    delivery_mode: str | None,
    exam_year: int,
    normalized_value: object,
    display_value: str,
) -> tuple[str, ...]:
    canonical = json.dumps(normalized_value, sort_keys=True, ensure_ascii=False)
    return (
        fact_key,
        str(exam_level_id),
        str(delivery_mode),
        str(exam_year),
        canonical,
        display_value,
    )


def approved_value_keys(cursor) -> set[tuple[str, ...]]:
    """Approved values must not re-enter the review queue when ingest re-runs.

    Candidate ids carry a value digest so a rejected candidate can be superseded;
    without this guard every unchanged fact would return as a duplicate pending row.
    """
    cursor.execute(
        """SELECT fact_key, exam_level_id, delivery_mode, exam_year,
                  normalized_value::text, display_value
        FROM candidate_facts
        WHERE qualification_id=%s AND status='approved' AND synthetic=false""",
        (QUALIFICATION_ID,),
    )
    return {
        value_key(row[0], row[1], row[2], row[3], json.loads(row[4]), row[5])
        for row in cursor.fetchall()
    }


def ingest_snapshot(database_url: str, source_id: str, snapshot_path: str | Path, exam_year: int = 2026) -> dict[str, int | str]:
    if os.getenv("NODE_ENV", "development") == "production" or os.getenv("BOOKKEEPING_LOCAL_WRITE") != "1":
        raise RuntimeError("bookkeeping ingest requires explicit non-production local-write authorization")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("bookkeeping ingest only permits localhost databases")
    path = Path(snapshot_path).resolve()
    if SNAPSHOT_ROOT not in path.parents or path.suffix.lower() != ".html":
        raise ValueError("snapshot must be HTML below var/official-snapshots/bookkeeping")
    record = capture_record(source_id, path)
    snapshot = snapshot_from_bytes(source_id, path.read_bytes(), synthetic=False)
    if snapshot.content_hash != record["content_hash"]:
        raise ValueError("raw snapshot hash does not match capture report")
    candidates, issues = extract_candidates(snapshot)
    if issues:
        raise ValueError("snapshot parse failed: " + "; ".join(issue.code for issue in issues))
    snapshot_id = f"snapshot:bookkeeping:{snapshot.content_hash}"
    inserted = 0
    captured_at = str(record["captured_at"])
    capture_run_id = f"capture-run:bookkeeping:{snapshot.content_hash}"
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""INSERT INTO capture_runs
                (id,started_at,finished_at,status,request_count,collector_version)
                VALUES (%s,%s,%s,'succeeded',%s,'collector.capture_bookkeeping')
                ON CONFLICT (id) DO NOTHING""",
                (capture_run_id, captured_at, captured_at, int(record.get("attempts", 1))))
            cursor.execute("""INSERT INTO snapshots
                (id,source_id,content_hash,object_key,synthetic,retrieved_at,capture_run_id,original_url,final_url,http_status,retrieved_at_jst,collector_version)
                VALUES (%s,%s,%s,%s,false,%s,%s,%s,%s,%s,%s,'collector.capture_bookkeeping')
                ON CONFLICT (source_id,content_hash) DO UPDATE SET
                  object_key=EXCLUDED.object_key,synthetic=EXCLUDED.synthetic,retrieved_at=EXCLUDED.retrieved_at,
                  capture_run_id=EXCLUDED.capture_run_id,original_url=EXCLUDED.original_url,final_url=EXCLUDED.final_url,
                  http_status=EXCLUDED.http_status,retrieved_at_jst=EXCLUDED.retrieved_at_jst,collector_version=EXCLUDED.collector_version""",
                (snapshot_id, source_id, snapshot.content_hash, str(path), captured_at, capture_run_id,
                 record["url"], record["url"], record["status_code"], captured_at))
            cursor.execute("""INSERT INTO source_checks
                (id,source_id,capture_run_id,snapshot_id,checked_at,status,http_status,message)
                VALUES (%s,%s,%s,%s,%s,'changed',%s,'Captured official page; candidate staging is pending review.')
                ON CONFLICT (id) DO NOTHING""",
                (f"source-check:bookkeeping:{snapshot.content_hash}", source_id, capture_run_id,
                 snapshot_id, captured_at, record["status_code"]))
            approved = approved_value_keys(cursor)
            skipped = 0
            for c in candidates:
                key = value_key(
                    c.fact_key, c.exam_level_id, c.delivery_mode, exam_year,
                    c.normalized_value, c.display_value,
                )
                if key in approved:
                    skipped += 1
                    continue
                payload = json.dumps(
                    [c.fact_key, c.value_type, c.normalized_value, c.display_value, c.evidence_text],
                    ensure_ascii=False,
                )
                value_digest = hashlib.sha256(payload.encode()).hexdigest()[:12]
                candidate_id = f"candidate:bookkeeping:{snapshot.content_hash}:{c.exam_level_id}:{c.delivery_mode}:{c.fact_key}:{value_digest}"
                cursor.execute("""INSERT INTO candidate_facts
                    (id,qualification_id,exam_level_id,delivery_mode,exam_year,fact_key,value_type,normalized_value,display_value,evidence_text,status,risk_level,source_id,source_snapshot_id,synthetic)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,'pending_review',%s,%s,%s,false) ON CONFLICT DO NOTHING""",
                    (candidate_id, QUALIFICATION_ID, c.exam_level_id, c.delivery_mode, exam_year, c.fact_key, c.value_type,
                     json.dumps(c.normalized_value, ensure_ascii=False), c.display_value, c.evidence_text, c.risk_level, source_id, snapshot_id))
                inserted += cursor.rowcount
    return {"source_id": source_id, "candidates": inserted, "skipped_approved": skipped, "approval": "not_run"}


if __name__ == "__main__":
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    mapping = {
        "home.html": "source:bookkeeping:home",
        "network.html": "source:bookkeeping:network",
        "calendar-2026.html": "source:bookkeeping:calendar-2026",
        "class1-exam.html": "source:bookkeeping:class1-exam",
        "class2-exam.html": "source:bookkeeping:class2-exam",
    }
    print(json.dumps([ingest_snapshot(database_url, source, SNAPSHOT_ROOT / name) for name, source in mapping.items()], ensure_ascii=False, indent=2))
