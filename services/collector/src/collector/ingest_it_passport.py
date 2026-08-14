"""Explicitly authorized local ingestion for IT Passport fixtures.

This command is intentionally fixture-only.  It requires an explicit exam
year because IT Passport does not have one fixed annual calendar, and it
refuses production environments and non-local databases.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.it_passport import extract_candidates, snapshot_from_html


QUALIFICATION_ID = "qualification:it-passport"
FIXTURE_ROOT = Path("fixtures/official-snapshots").resolve()


def ingest_fixture(
    database_url: str,
    source_id: str,
    fixture_path: str | Path,
    exam_year: int,
) -> dict[str, int | str]:
    """Write synthetic candidates only after explicit local authorization."""
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("fixture ingest refuses NODE_ENV=production")
    if os.getenv("STAGE2_LOCAL_WRITE") != "1":
        raise RuntimeError("set STAGE2_LOCAL_WRITE=1 to authorize local candidate writes")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("fixture ingest only permits localhost database hosts")
    if exam_year < 2000 or exam_year > 2100:
        raise ValueError("exam_year must be explicit and within 2000..2100")

    path = Path(fixture_path).resolve()
    if FIXTURE_ROOT not in path.parents or path.suffix.lower() != ".html":
        raise ValueError("fixture_path must be an HTML file below fixtures/official-snapshots")
    html = path.read_text(encoding="utf-8")
    snapshot = snapshot_from_html(source_id, html, synthetic=True)
    candidates, issues = extract_candidates(snapshot)
    if issues:
        raise ValueError("fixture parse failed: " + "; ".join(issue.code for issue in issues))

    snapshot_id = f"snapshot:it-passport:{snapshot.content_hash}"
    retrieved_at = datetime.now(timezone.utc)
    inserted = 0
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO snapshots (id, source_id, content_hash, object_key, synthetic, retrieved_at)
                VALUES (%s, %s, %s, %s, true, %s)
                ON CONFLICT (source_id, content_hash) DO NOTHING""",
                (snapshot_id, source_id, snapshot.content_hash, str(path), retrieved_at),
            )
            for candidate in candidates:
                candidate_id = f"candidate:it-passport:{snapshot.content_hash}:{candidate.fact_key}"
                cursor.execute(
                    """INSERT INTO candidate_facts
                    (id, qualification_id, exam_year, fact_key, value_type, normalized_value, display_value, status, risk_level, source_id, source_snapshot_id, synthetic)
                    VALUES (%s, %s, %s, %s, 'text', %s::jsonb, %s, %s, %s, %s, %s, true)
                    ON CONFLICT DO NOTHING""",
                    (
                        candidate_id,
                        QUALIFICATION_ID,
                        exam_year,
                        candidate.fact_key,
                        json.dumps(candidate.normalized_value, ensure_ascii=False),
                        candidate.display_value,
                        candidate.status,
                        candidate.risk_level,
                        source_id,
                        snapshot_id,
                    ),
                )
                inserted += cursor.rowcount
    return {"status": "inserted", "candidates": inserted, "snapshot": snapshot.content_hash}


if __name__ == "__main__":
    database_url = os.getenv("DATABASE_URL")
    fixture = os.getenv("IT_PASSPORT_FIXTURE")
    source_id = os.getenv("IT_PASSPORT_SOURCE_ID", "source:it-passport:jitec-home")
    year = os.getenv("IT_PASSPORT_EXAM_YEAR")
    if not database_url or not fixture or not year:
        raise SystemExit(
            "DATABASE_URL, IT_PASSPORT_FIXTURE and IT_PASSPORT_EXAM_YEAR are required"
        )
    print(json.dumps(ingest_fixture(database_url, source_id, fixture, int(year)), ensure_ascii=False))
