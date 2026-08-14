"""Insert analyzed real IT Passport candidates into a local review queue."""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import psycopg


QUALIFICATION_ID = "qualification:it-passport"
CAPTURE_ROOT = Path("var/official-snapshots/it-passport").resolve()


def ingest_analysis(
    database_url: str,
    analysis_path: str | Path = CAPTURE_ROOT / "analysis-report.json",
    exam_year: int = 2026,
) -> dict[str, int | str]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("real candidate ingest refuses NODE_ENV=production")
    if os.getenv("IT_PASSPORT_REAL_CANDIDATE_WRITE") != "1":
        raise RuntimeError(
            "set IT_PASSPORT_REAL_CANDIDATE_WRITE=1 to authorize local review-queue writes"
        )
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("real candidate ingest only permits localhost database hosts")
    if exam_year < 2000 or exam_year > 2100:
        raise ValueError("exam_year must be explicit and within 2000..2100")

    path = Path(analysis_path).resolve()
    if CAPTURE_ROOT not in path.parents or path.name != "analysis-report.json":
        raise ValueError("analysis_path must be the captured IT Passport analysis report")
    analysis = json.loads(path.read_text(encoding="utf-8"))
    if analysis.get("database_write") != "not_run":
        raise ValueError("analysis report is not in a pre-ingest state")
    inserted_snapshots = 0
    inserted_candidates = 0
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            for source_result in analysis["results"]:
                candidates = source_result.get("candidates", [])
                if not candidates:
                    continue
                content_hash = source_result["content_hash"]
                snapshot_path = CAPTURE_ROOT / f"{content_hash}.html"
                if not snapshot_path.exists():
                    raise ValueError(f"snapshot file missing: {snapshot_path}")
                snapshot_id = f"snapshot:it-passport:{content_hash}"
                cursor.execute(
                    """INSERT INTO snapshots
                    (id, source_id, content_hash, object_key, synthetic, retrieved_at)
                    VALUES (%s, %s, %s, %s, false, now())
                    ON CONFLICT (source_id, content_hash) DO NOTHING""",
                    (
                        snapshot_id,
                        source_result["source_id"],
                        content_hash,
                        str(snapshot_path),
                    ),
                )
                inserted_snapshots += cursor.rowcount
                for candidate in candidates:
                    if candidate["status"] != "pending_review":
                        raise ValueError("only pending_review candidates may be ingested")
                    if candidate["risk_level"] != "high":
                        raise ValueError("real IT Passport candidates must be high risk")
                    if candidate["synthetic"] is not False:
                        raise ValueError("real candidate must have synthetic=false")
                    value_type = (
                        "datetime"
                        if candidate["fact_key"].startswith("application_open_")
                        else "text"
                    )
                    candidate_id = (
                        f"candidate:it-passport:{content_hash}:{candidate['fact_key']}"
                    )
                    cursor.execute(
                        """INSERT INTO candidate_facts
                        (id, qualification_id, exam_year, fact_key, value_type,
                         normalized_value, display_value, evidence_text, status,
                         risk_level, source_id, source_snapshot_id, synthetic)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s,
                                'pending_review', 'high', %s, %s, false)
                        ON CONFLICT DO NOTHING""",
                        (
                            candidate_id,
                            QUALIFICATION_ID,
                            exam_year,
                            candidate["fact_key"],
                            value_type,
                            json.dumps(candidate["normalized_value"], ensure_ascii=False),
                            candidate["display_value"],
                            candidate["evidence_text"],
                            source_result["source_id"],
                            snapshot_id,
                        ),
                    )
                    inserted_candidates += cursor.rowcount
    return {
        "status": "inserted",
        "snapshots": inserted_snapshots,
        "candidates": inserted_candidates,
        "approval": "not_run",
    }


if __name__ == "__main__":
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    exam_year = int(os.getenv("IT_PASSPORT_EXAM_YEAR", "2026"))
    print(
        json.dumps(
            ingest_analysis(database_url, exam_year=exam_year),
            ensure_ascii=False,
            indent=2,
        )
    )
