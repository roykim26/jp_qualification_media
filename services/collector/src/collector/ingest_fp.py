"""Explicit localhost-only ingest for captured FP技能検定 snapshots."""

from __future__ import annotations

import json
import os
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.fp import extract_candidates, snapshot_from_html

QUALIFICATION_ID = "qualification:fp"
SNAPSHOT_ROOT = Path("var/official-snapshots/fp").resolve()
COLLECTOR_VERSION = "collector.capture_fp"


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


def ingest_snapshot(database_url: str, source_id: str, snapshot_path: str | Path, exam_year: int = 2026) -> dict[str, int | str]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("FP snapshot ingest refuses NODE_ENV=production")
    if os.getenv("FP_LOCAL_WRITE") != "1":
        raise RuntimeError("set FP_LOCAL_WRITE=1 to authorize local review-queue writes")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("FP ingest only permits localhost databases")
    path = Path(snapshot_path).resolve()
    if SNAPSHOT_ROOT not in path.parents or path.suffix.lower() != ".html":
        raise ValueError("snapshot must be HTML below var/official-snapshots/fp")
    record = capture_record(source_id, path)
    snapshot = snapshot_from_html(source_id, path.read_bytes().decode("utf-8"), synthetic=False)
    if snapshot.content_hash != record["content_hash"]:
        raise ValueError("adapter snapshot hash does not match capture report")
    candidates, issues = extract_candidates(snapshot)
    if issues:
        raise ValueError("snapshot parse failed: " + "; ".join(issue.code for issue in issues))
    snapshot_id = f"snapshot:fp:{snapshot.content_hash}"
    captured_at = str(record["captured_at"])
    capture_run_id = f"capture-run:fp:{snapshot.content_hash}"
    inserted = 0
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""INSERT INTO capture_runs
                (id,started_at,finished_at,status,request_count,collector_version)
                VALUES (%s,%s,%s,'succeeded',%s,%s) ON CONFLICT (id) DO NOTHING""",
                (capture_run_id, captured_at, captured_at, int(record.get("attempts", 1)), COLLECTOR_VERSION))
            cursor.execute("""INSERT INTO snapshots
                (id,source_id,content_hash,object_key,synthetic,retrieved_at,capture_run_id,original_url,final_url,http_status,retrieved_at_jst,collector_version)
                VALUES (%s,%s,%s,%s,false,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (source_id,content_hash) DO UPDATE SET
                  object_key=EXCLUDED.object_key,synthetic=EXCLUDED.synthetic,retrieved_at=EXCLUDED.retrieved_at,
                  capture_run_id=EXCLUDED.capture_run_id,original_url=EXCLUDED.original_url,final_url=EXCLUDED.final_url,
                  http_status=EXCLUDED.http_status,retrieved_at_jst=EXCLUDED.retrieved_at_jst,collector_version=EXCLUDED.collector_version""",
                (snapshot_id, source_id, snapshot.content_hash, str(path), captured_at, capture_run_id,
                 record["url"], record["url"], record["status_code"], captured_at, COLLECTOR_VERSION))
            cursor.execute("""INSERT INTO source_checks
                (id,source_id,capture_run_id,snapshot_id,checked_at,status,http_status,message)
                VALUES (%s,%s,%s,%s,%s,'changed',%s,'Captured official page; candidate staging is pending review.')
                ON CONFLICT (id) DO NOTHING""",
                (f"source-check:fp:{snapshot.content_hash}", source_id, capture_run_id, snapshot_id,
                 captured_at, record["status_code"]))
            for c in candidates:
                candidate_id = f"candidate:fp:{snapshot.content_hash}:{c.provider_id}:{c.exam_level_id}:{c.exam_component}:{c.delivery_mode}:{c.fact_key}"
                cursor.execute("""INSERT INTO candidate_facts
                    (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,exam_year,fact_key,value_type,normalized_value,display_value,evidence_text,status,risk_level,source_id,source_snapshot_id,synthetic)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,'pending_review',%s,%s,%s,false)
                    ON CONFLICT (id) DO UPDATE SET normalized_value=EXCLUDED.normalized_value,
                      display_value=EXCLUDED.display_value, evidence_text=EXCLUDED.evidence_text,
                      value_type=EXCLUDED.value_type
                    WHERE candidate_facts.status='pending_review'""",
                    (candidate_id, QUALIFICATION_ID, c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode, exam_year,
                     c.fact_key, c.value_type, json.dumps(c.normalized_value, ensure_ascii=False), c.display_value,
                     c.evidence_text, c.risk_level, source_id, snapshot_id))
                inserted += cursor.rowcount
    return {"source_id": source_id, "candidates": inserted, "approval": "not_run"}


if __name__ == "__main__":
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    mapping = {
        "jafp-2-3-outline.html": "source:fp:jafp-2-3-outline",
        "kinzai-1-academic.html": "source:fp:kinzai-1-academic",
        "kinzai-1-practical.html": "source:fp:kinzai-1-practical",
        "kinzai-eligibility.html": "source:fp:kinzai-eligibility",
    }
    print(json.dumps([ingest_snapshot(database_url, source, SNAPSHOT_ROOT / name) for name, source in mapping.items()], ensure_ascii=False, indent=2))
