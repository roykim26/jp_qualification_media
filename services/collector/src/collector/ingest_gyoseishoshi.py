"""Explicit local ingest for 行政書士 official snapshots.

The command writes only non-production, pending-review candidates. Approval is
performed separately by the local admin review service.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.gyoseishoshi import extract_candidates, snapshot_from_html


QUALIFICATION_ID = "qualification:gyoseishoshi"
SNAPSHOT_ROOT = Path("var/official-snapshots/gyoseishoshi").resolve()


def ingest_snapshot(
    database_url: str,
    source_id: str,
    snapshot_path: str | Path,
    exam_year: int,
) -> dict[str, int | str]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("行政書士 snapshot ingest refuses NODE_ENV=production")
    if os.getenv("GYOSEISHOSHI_LOCAL_WRITE") != "1":
        raise RuntimeError("set GYOSEISHOSHI_LOCAL_WRITE=1 to authorize local review-queue writes")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("行政書士 ingest only permits localhost database hosts")
    if exam_year < 2000 or exam_year > 2100:
        raise ValueError("exam_year must be explicit and within 2000..2100")
    path = Path(snapshot_path).resolve()
    if SNAPSHOT_ROOT not in path.parents or path.suffix.lower() != ".html":
        raise ValueError("snapshot_path must be an HTML file below var/official-snapshots/gyoseishoshi")
    snapshot = snapshot_from_html(source_id, path.read_text(encoding="utf-8"), synthetic=False)
    candidates, issues = extract_candidates(snapshot)
    if issues:
        raise ValueError("snapshot parse failed: " + "; ".join(issue.code for issue in issues))
    snapshot_id = f"snapshot:gyoseishoshi:{snapshot.content_hash}"
    inserted_candidates = 0
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO snapshots (id, source_id, content_hash, object_key, synthetic, retrieved_at)
                VALUES (%s, %s, %s, %s, false, now())
                ON CONFLICT (source_id, content_hash) DO NOTHING""",
                (snapshot_id, source_id, snapshot.content_hash, str(path)),
            )
            for candidate in candidates:
                cursor.execute(
                    """INSERT INTO candidate_facts
                    (id, qualification_id, exam_year, fact_key, value_type, normalized_value,
                     display_value, evidence_text, status, risk_level, source_id, source_snapshot_id, synthetic)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, 'pending_review', 'high', %s, %s, false)
                    ON CONFLICT DO NOTHING""",
                    (
                        f"candidate:gyoseishoshi:{snapshot.content_hash}:{candidate.fact_key}",
                        QUALIFICATION_ID,
                        exam_year,
                        candidate.fact_key,
                        candidate.value_type,
                        json.dumps(candidate.normalized_value, ensure_ascii=False),
                        candidate.display_value,
                        candidate.evidence_text,
                        source_id,
                        snapshot_id,
                    ),
                )
                inserted_candidates += cursor.rowcount
    return {"status": "inserted", "snapshots": 1, "candidates": inserted_candidates, "approval": "not_run"}


if __name__ == "__main__":
    database_url = os.getenv("DATABASE_URL")
    snapshot = os.getenv("GYOSEISHOSHI_SNAPSHOT")
    source_id = os.getenv("GYOSEISHOSHI_SOURCE_ID", "source:gyoseishoshi:guide")
    if not database_url or not snapshot:
        raise SystemExit("DATABASE_URL and GYOSEISHOSHI_SNAPSHOT are required")
    print(json.dumps(ingest_snapshot(database_url, source_id, snapshot, int(os.getenv("GYOSEISHOSHI_EXAM_YEAR", "2026"))), ensure_ascii=False))
