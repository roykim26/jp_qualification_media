from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.http_policy import SafeFetcher, SourcePolicy
from collector.takken import TAKKEN_SOURCE, extract_schedule_candidates


SCHEDULE_URL = "https://www.retio.or.jp/exam/schedule/"
SNAPSHOT_ROOT = Path("var/official-snapshots/takken").resolve()


def capture_record(snapshot_path: Path) -> dict[str, object]:
    report = json.loads((SNAPSHOT_ROOT / "capture-report.json").read_text(encoding="utf-8"))
    record = next(
        (item for item in report.get("results", []) if item.get("source_id") == TAKKEN_SOURCE["id"]),
        None,
    )
    if not record or record.get("status") != "ok" or record.get("status_code") != 200:
        raise ValueError("capture report has no successful record for the registered Takken source")
    if Path(str(record.get("snapshot_path", ""))).resolve() != snapshot_path:
        raise ValueError("capture report snapshot path does not match ingest path")
    if not isinstance(record.get("content_hash"), str) or not isinstance(record.get("captured_at"), str):
        raise ValueError("capture report lacks hash or timestamp")
    if sha256(snapshot_path.read_bytes()).hexdigest() != record["content_hash"]:
        raise ValueError("raw snapshot hash does not match capture report")
    return record


def ingest_snapshot(database_url: str, snapshot_path: str | Path) -> dict[str, int | str]:
    """Queue an already captured official schedule without performing HTTP."""
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("local Takken candidate ingest refuses NODE_ENV=production")
    if os.getenv("STAGE1_LOCAL_WRITE") != "1":
        raise RuntimeError("set STAGE1_LOCAL_WRITE=1 to authorize local candidate writes")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("candidate ingest only permits localhost database hosts")
    path = Path(snapshot_path).resolve()
    if SNAPSHOT_ROOT not in path.parents or path.suffix.lower() != ".html":
        raise ValueError("snapshot_path must be an HTML file below var/official-snapshots/takken")

    record = capture_record(path)
    from collector.takken import snapshot_from_html

    # Keep the persisted SHA-256 bound to the immutable file bytes.  Text-mode
    # reads can normalize CRLF and would make the recorded hash unverifiable.
    snapshot = snapshot_from_html(path.read_bytes().decode("utf-8"), synthetic=False)
    if snapshot.content_hash != record["content_hash"]:
        raise ValueError("adapter snapshot hash does not match capture report")
    candidates = extract_schedule_candidates(snapshot)
    if not candidates:
        raise ValueError("snapshot parse failed: no explicitly labelled schedule candidates")
    inserted = 0
    captured_at = str(record["captured_at"])
    capture_run_id = f"capture-run:takken:{snapshot.content_hash}"
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO capture_runs
                (id,started_at,finished_at,status,request_count,collector_version)
                VALUES (%s,%s,%s,'succeeded',%s,'collector.capture_takken')
                ON CONFLICT (id) DO NOTHING""",
                (capture_run_id, captured_at, captured_at, int(record.get("attempts", 1))),
            )
            cursor.execute(
                """INSERT INTO snapshots
                (id,source_id,content_hash,object_key,synthetic,retrieved_at,capture_run_id,original_url,final_url,http_status,retrieved_at_jst,collector_version)
                VALUES (%s,%s,%s,%s,false,%s,%s,%s,%s,%s,%s,'collector.capture_takken')
                ON CONFLICT (source_id,content_hash) DO UPDATE SET
                  object_key=EXCLUDED.object_key,synthetic=EXCLUDED.synthetic,retrieved_at=EXCLUDED.retrieved_at,
                  capture_run_id=EXCLUDED.capture_run_id,original_url=EXCLUDED.original_url,final_url=EXCLUDED.final_url,
                  http_status=EXCLUDED.http_status,retrieved_at_jst=EXCLUDED.retrieved_at_jst,collector_version=EXCLUDED.collector_version""",
                (f"snapshot:takken:{snapshot.content_hash}", snapshot.source_id, snapshot.content_hash, str(path),
                 captured_at, capture_run_id, record["url"], record["url"], record["status_code"], captured_at),
            )
            cursor.execute(
                """INSERT INTO source_checks
                (id,source_id,capture_run_id,snapshot_id,checked_at,status,http_status,message)
                VALUES (%s,%s,%s,%s,%s,'changed',%s,'Captured official page; candidate staging is pending review.')
                ON CONFLICT (id) DO NOTHING""",
                (f"source-check:takken:{snapshot.content_hash}", snapshot.source_id, capture_run_id,
                 f"snapshot:takken:{snapshot.content_hash}", captured_at, record["status_code"]),
            )
            for candidate in candidates:
                cursor.execute(
                    """INSERT INTO candidate_facts
                    (id, qualification_id, exam_year, fact_key, value_type, normalized_value,
                     display_value, evidence_text, status, risk_level, source_id, source_snapshot_id, synthetic)
                    VALUES (%s, 'qualification:takken', %s, %s, %s, %s::jsonb, %s, %s,
                            'pending_review', 'high', %s, %s, false)
                    ON CONFLICT DO NOTHING""",
                    (
                        f"candidate:takken:{snapshot.content_hash}:{candidate.fact_key}",
                        candidate.exam_year,
                        candidate.fact_key,
                        "date" if candidate.normalized_value.endswith("T00:00:00+09:00") else "datetime",
                        json.dumps(candidate.normalized_value),
                        candidate.display_value,
                        candidate.display_value,
                        candidate.source_id,
                        f"snapshot:takken:{snapshot.content_hash}",
                    ),
                )
                inserted += cursor.rowcount
    return {"status": "inserted", "candidates": inserted, "approval": "not_run"}


def ingest_local() -> dict[str, int | str]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("local Takken candidate ingest refuses NODE_ENV=production")
    if os.getenv("STAGE1_LOCAL_WRITE") != "1":
        raise RuntimeError("set STAGE1_LOCAL_WRITE=1 to authorize local candidate writes")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("candidate ingest only permits localhost database hosts")

    policy = SourcePolicy(
        source_id=TAKKEN_SOURCE["id"],
        allowed_hosts=frozenset({TAKKEN_SOURCE["allowed_domain"]}),
        max_redirects=3,
        max_bytes=5 * 1024 * 1024,
        max_retries=2,
        backoff_seconds=0.25,
    )
    fetcher = SafeFetcher(policy)
    try:
        result = fetcher.fetch(SCHEDULE_URL)
        if result.status not in {"ok", "not_modified"} or result.body is None:
            return {"status": result.status, "candidates": 0}
        html = result.body.decode("utf-8", errors="strict")
        from collector.takken import snapshot_from_html

        snapshot = snapshot_from_html(html, synthetic=False)
        candidates = extract_schedule_candidates(snapshot)
        if not candidates:
            return {"status": "parsed_no_candidates", "candidates": 0}
        cache_root = Path("var/official-snapshots/takken")
        cache_root.mkdir(parents=True, exist_ok=True)
        snapshot_path = cache_root / f"{snapshot.content_hash}.html"
        if not snapshot_path.exists():
            snapshot_path.write_bytes(result.body)
        retrieved_at = datetime.now(timezone.utc)
        inserted = 0
        with psycopg.connect(database_url, connect_timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO snapshots (id, source_id, content_hash, object_key, synthetic, retrieved_at)
                    VALUES (%s, %s, %s, %s, false, %s)
                    ON CONFLICT (source_id, content_hash) DO NOTHING""",
                    (f"snapshot:takken:{snapshot.content_hash}", snapshot.source_id, snapshot.content_hash, str(snapshot_path), retrieved_at),
                )
                for candidate in candidates:
                    cursor.execute(
                        """INSERT INTO candidate_facts
                        (id, qualification_id, exam_year, fact_key, value_type, normalized_value, display_value, status, risk_level, source_id, source_snapshot_id, synthetic)
                        VALUES (%s, 'qualification:takken', %s, %s, %s, %s::jsonb, %s, 'pending_review', 'high', %s, %s, false)
                        ON CONFLICT DO NOTHING""",
                        (f"candidate:takken:{snapshot.content_hash}:{candidate.fact_key}", candidate.exam_year, candidate.fact_key, "date" if candidate.normalized_value.endswith("T00:00:00+09:00") else "datetime", json.dumps(candidate.normalized_value), candidate.display_value, candidate.source_id, f"snapshot:takken:{snapshot.content_hash}"),
                    )
                    inserted += cursor.rowcount
        return {"status": "inserted", "candidates": inserted, "snapshot": snapshot.content_hash}
    finally:
        fetcher.close()


if __name__ == "__main__":
    database_url = os.getenv("DATABASE_URL")
    snapshot_path = os.getenv("TAKKEN_SNAPSHOT")
    if snapshot_path:
        if not database_url:
            raise SystemExit("DATABASE_URL is required")
        print(json.dumps(ingest_snapshot(database_url, snapshot_path), ensure_ascii=False))
    else:
        print(json.dumps(ingest_local(), ensure_ascii=False))
