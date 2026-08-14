"""Explicit localhost-only ingest for captured FP技能検定 snapshots."""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.fp import extract_candidates, snapshot_from_html

QUALIFICATION_ID = "qualification:fp"
SNAPSHOT_ROOT = Path("var/official-snapshots/fp").resolve()


def ingest_snapshot(database_url: str, source_id: str, snapshot_path: str | Path, exam_year: int = 2026) -> dict[str, int | str]:
    if os.getenv("NODE_ENV", "development") == "production" or os.getenv("FP_LOCAL_WRITE") != "1":
        raise RuntimeError("FP ingest requires explicit non-production local-write authorization")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("FP ingest only permits localhost databases")
    path = Path(snapshot_path).resolve()
    if SNAPSHOT_ROOT not in path.parents or path.suffix.lower() != ".html":
        raise ValueError("snapshot must be HTML below var/official-snapshots/fp")
    snapshot = snapshot_from_html(source_id, path.read_text(encoding="utf-8"), synthetic=False)
    candidates, issues = extract_candidates(snapshot)
    if issues:
        raise ValueError("snapshot parse failed: " + "; ".join(issue.code for issue in issues))
    snapshot_id = f"snapshot:fp:{snapshot.content_hash}"
    inserted = 0
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""INSERT INTO snapshots (id,source_id,content_hash,object_key,synthetic,retrieved_at)
                VALUES (%s,%s,%s,%s,false,now()) ON CONFLICT (source_id,content_hash) DO NOTHING""",
                (snapshot_id, source_id, snapshot.content_hash, str(path)))
            for c in candidates:
                candidate_id = f"candidate:fp:{snapshot.content_hash}:{c.provider_id}:{c.exam_level_id}:{c.exam_component}:{c.delivery_mode}:{c.fact_key}"
                cursor.execute("""INSERT INTO candidate_facts
                    (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,exam_year,fact_key,value_type,normalized_value,display_value,evidence_text,status,risk_level,source_id,source_snapshot_id,synthetic)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,'pending_review',%s,%s,%s,false) ON CONFLICT DO NOTHING""",
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
    }
    print(json.dumps([ingest_snapshot(database_url, source, SNAPSHOT_ROOT / name) for name, source in mapping.items()], ensure_ascii=False, indent=2))
