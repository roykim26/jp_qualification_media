from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from collector.http_policy import SafeFetcher, SourcePolicy
from collector.takken import TAKKEN_SOURCE, extract_schedule_candidates


SCHEDULE_URL = "https://www.retio.or.jp/exam/schedule/"


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
    print(json.dumps(ingest_local(), ensure_ascii=False))
