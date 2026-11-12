"""Explicit local ingest for Fundamental IT official snapshots."""

from __future__ import annotations

import json
import os
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.fe_statistics_xlsx import extract_candidates as extract_suiihyo_candidates
from collector.fe_statistics_xlsx import snapshot_from_xlsx
from collector.fundamental_it import extract_candidates, snapshot_from_html
from collector.youkou_pdf import SOURCE_ID as YOUKOU_PDF_SOURCE_ID
from collector.youkou_pdf import extract_candidates as extract_pdf_candidates
from collector.youkou_pdf import snapshot_from_pdf


QUALIFICATION_ID = "qualification:fundamental-it-engineer"
SNAPSHOT_ROOT = Path("var/official-snapshots/fundamental-it").resolve()


def capture_record(source_id: str, snapshot_path: Path) -> dict[str, object]:
    report = json.loads((SNAPSHOT_ROOT / "capture-report.json").read_text(encoding="utf-8"))
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
    if sha256(snapshot_path.read_bytes()).hexdigest() != record["content_hash"]:
        raise ValueError("raw snapshot hash does not match capture report")
    return record


def selected_candidates(candidates, exam_year: int, only_exam_year: int | None):
    """Batch scope (owner decision D3): keep only the requested coverage year.

    Statistics candidates carry their own exam_year; other candidates use the
    ingest-time fallback.  None keeps the whole snapshot.
    """
    if only_exam_year is None:
        return list(candidates)
    return [
        candidate
        for candidate in candidates
        if (exam_year if candidate.exam_year is None else candidate.exam_year) == only_exam_year
    ]


def ingest_snapshot(database_url: str, source_id: str, snapshot_path: str | Path, exam_year: int, *, only_exam_year: int | None = None) -> dict[str, int | str]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("Fundamental IT ingest refuses NODE_ENV=production")
    if os.getenv("FUNDAMENTAL_IT_LOCAL_WRITE") != "1":
        raise RuntimeError("set FUNDAMENTAL_IT_LOCAL_WRITE=1 to authorize local review-queue writes")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Fundamental IT ingest only permits localhost database hosts")
    path = Path(snapshot_path).resolve()
    if SNAPSHOT_ROOT not in path.parents or path.suffix.lower() not in {".html", ".pdf", ".xlsx"}:
        raise ValueError("snapshot_path must be an HTML, PDF or XLSX file below var/official-snapshots/fundamental-it")
    record = capture_record(source_id, path)
    # The capture report validates the raw bytes before any text extraction.
    raw = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix == ".xlsx":
        snapshot = snapshot_from_xlsx(source_id, raw, synthetic=False)
        candidates, issues = extract_suiihyo_candidates(snapshot)
    elif suffix == ".pdf":
        # PDF extraction is per-source: only the 試験要綱 has a PDF extractor.
        # Other PDF sources must not silently reuse the youkou adapter.
        if source_id != YOUKOU_PDF_SOURCE_ID:
            raise ValueError(f"no PDF extractor registered for source: {source_id}")
        snapshot = snapshot_from_pdf(raw, synthetic=False)
        candidates, issues = extract_pdf_candidates(snapshot)
    else:
        snapshot = snapshot_from_html(source_id, raw.decode("utf-8"), synthetic=False)
        candidates, issues = extract_candidates(snapshot)
    if snapshot.content_hash != record["content_hash"]:
        raise ValueError("adapter snapshot hash does not match capture report")
    if issues:
        raise ValueError("snapshot parse failed: " + "; ".join(issue.code for issue in issues))
    candidates = selected_candidates(candidates, exam_year, only_exam_year)
    if not candidates:
        raise ValueError(f"no candidates match the exam_year scope (only_exam_year={only_exam_year})")
    snapshot_id = f"snapshot:fundamental-it:{snapshot.content_hash}"
    inserted = 0
    captured_at = str(record["captured_at"])
    capture_run_id = f"capture-run:fundamental-it:{snapshot.content_hash}"
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""INSERT INTO capture_runs
                (id,started_at,finished_at,status,request_count,collector_version)
                VALUES (%s,%s,%s,'succeeded',%s,'collector.capture_fundamental_it')
                ON CONFLICT (id) DO NOTHING""",
                (capture_run_id, captured_at, captured_at, int(record.get("attempts", 1))))
            cursor.execute("""INSERT INTO snapshots
                (id,source_id,content_hash,object_key,synthetic,retrieved_at,capture_run_id,original_url,final_url,http_status,retrieved_at_jst,collector_version)
                VALUES (%s,%s,%s,%s,false,%s,%s,%s,%s,%s,%s,'collector.capture_fundamental_it')
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
                (f"source-check:fundamental-it:{snapshot.content_hash}", source_id, capture_run_id,
                 snapshot_id, captured_at, record["status_code"]))
            for candidate in candidates:
                # Statistics rows carry their own coverage year (owner decision
                # D2); other candidates keep the ingest-time exam_year.
                year = exam_year if candidate.exam_year is None else candidate.exam_year
                cursor.execute("""INSERT INTO candidate_facts
                    (id,qualification_id,exam_year,fact_key,value_type,normalized_value,display_value,evidence_text,status,risk_level,delivery_mode,exam_component,source_id,source_snapshot_id,synthetic)
                    VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s,'pending_review',%s,%s,%s,%s,%s,false)
                    ON CONFLICT DO NOTHING""",
                    (f"candidate:fundamental-it:{snapshot.content_hash}:{year}:{candidate.fact_key}", QUALIFICATION_ID, year,
                     candidate.fact_key, candidate.value_type, json.dumps(candidate.normalized_value, ensure_ascii=False),
                     candidate.display_value, candidate.evidence_text, candidate.risk_level,
                     candidate.delivery_mode, candidate.exam_component, source_id, snapshot_id))
                inserted += cursor.rowcount
    return {"status": "inserted", "snapshots": 1, "candidates": inserted, "approval": "not_run"}


if __name__ == "__main__":
    database_url = os.getenv("DATABASE_URL")
    snapshot = os.getenv("FUNDAMENTAL_IT_SNAPSHOT")
    if not database_url or not snapshot:
        raise SystemExit("DATABASE_URL and FUNDAMENTAL_IT_SNAPSHOT are required")
    only_year_raw = os.getenv("FUNDAMENTAL_IT_ONLY_EXAM_YEAR", "")
    print(json.dumps(ingest_snapshot(database_url, os.getenv("FUNDAMENTAL_IT_SOURCE_ID", "source:fundamental-it:exam"), snapshot, int(os.getenv("FUNDAMENTAL_IT_EXAM_YEAR", "2026")), only_exam_year=int(only_year_raw) if only_year_raw else None), ensure_ascii=False))
