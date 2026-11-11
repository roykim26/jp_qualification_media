"""Record patrol results into operational tables only.

Writes ``capture_runs``, ``snapshots`` (changed sources only) and
``source_checks``.  Never touches ``candidate_facts``, ``facts``,
``fact_revisions``, ``change_events`` or ``reviews``.  This is a separately
authorized step from patrol capture: ``PATROL_LOCAL_WRITE=1`` plus a localhost
database plus non-production ``NODE_ENV``.

Only sources already registered in the database ``sources`` table are recorded;
capture-only evidence ids are skipped (registering a new source is a separate
decision).  Snapshot rows reuse the existing ``(source_id, content_hash)`` row
via ``ON CONFLICT ... DO UPDATE`` and ``RETURNING id`` so ``source_checks``
always links the real snapshot id.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

PATROL_REPORT = Path("var/patrol/patrol-report.json")
COLLECTOR_VERSION = "collector.patrol_sources/0.1"
JST = timezone(timedelta(hours=9))

_MESSAGES = {
    "unchanged": "Patrol check: content unchanged.",
    "changed": "Patrol check: new content captured; candidate staging is not run.",
    "failed": "Patrol check failed.",
    "blocked": "Patrol check blocked: final URL drifted from registration.",
}


def _run_status(statuses: list[str]) -> str:
    healthy = sum(1 for status in statuses if status in {"unchanged", "changed"})
    if healthy == len(statuses):
        return "succeeded"
    if healthy == 0:
        return "failed"
    return "partial"


def _jst(iso_timestamp: str) -> str:
    return datetime.fromisoformat(iso_timestamp).astimezone(JST).isoformat()


def group_runs(report: dict[str, object]) -> dict[str, list[dict[str, object]]]:
    runs: dict[str, list[dict[str, object]]] = {}
    for item in report.get("results", []):
        runs.setdefault(str(item.get("run_id", "patrol-unknown")), []).append(item)
    return runs


def capture_run_statement(run_id: str, items: list[dict[str, object]]) -> tuple[str, tuple]:
    checked = [str(item["checked_at"]) for item in items]
    statuses = [str(item["status"]) for item in items]
    errors = [str(item["error"]) for item in items if item.get("error")]
    return (
        """INSERT INTO capture_runs
            (id,started_at,finished_at,status,request_count,error_type,error_message,collector_version)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO NOTHING""",
        (
            f"capture-run:patrol:{run_id}",
            min(checked),
            max(checked),
            _run_status(statuses),
            len(items),
            "patrol_failure" if errors else None,
            "; ".join(errors)[:2000] if errors else None,
            COLLECTOR_VERSION,
        ),
    )


def snapshot_statement(item: dict[str, object], capture_run_id: str) -> tuple[str, tuple]:
    return (
        """INSERT INTO snapshots
            (id,source_id,content_hash,object_key,synthetic,retrieved_at,capture_run_id,original_url,final_url,http_status,retrieved_at_jst,collector_version)
        VALUES (%s,%s,%s,%s,false,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (source_id,content_hash) DO UPDATE SET
          object_key=EXCLUDED.object_key,synthetic=EXCLUDED.synthetic,retrieved_at=EXCLUDED.retrieved_at,
          capture_run_id=EXCLUDED.capture_run_id,original_url=EXCLUDED.original_url,final_url=EXCLUDED.final_url,
          http_status=EXCLUDED.http_status,retrieved_at_jst=EXCLUDED.retrieved_at_jst,collector_version=EXCLUDED.collector_version
        RETURNING id""",
        (
            f"snapshot:patrol:{item['source_id']}:{item['content_hash']}",
            str(item["source_id"]),
            str(item["content_hash"]),
            str(item["snapshot_path"]),
            str(item["checked_at"]),
            capture_run_id,
            str(item["url"]),
            str(item.get("final_url", item["url"])),
            item.get("http_status"),
            _jst(str(item["checked_at"])),
            COLLECTOR_VERSION,
        ),
    )


def source_check_statement(
    item: dict[str, object], capture_run_id: str, snapshot_id: str | None
) -> tuple[str, tuple]:
    status = str(item["status"])
    message = str(item.get("error") or _MESSAGES.get(status, "Patrol check."))
    return (
        """INSERT INTO source_checks
            (id,source_id,capture_run_id,snapshot_id,checked_at,status,http_status,message)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO NOTHING""",
        (
            f"source-check:patrol:{item['source_id']}:{item.get('run_id', 'patrol-unknown')}",
            str(item["source_id"]),
            capture_run_id,
            snapshot_id,
            str(item["checked_at"]),
            status,
            item.get("http_status"),
            message,
        ),
    )


def validate_changed_snapshots(report: dict[str, object]) -> None:
    for item in report.get("results", []):
        if item.get("status") != "changed":
            continue
        path = Path(str(item["snapshot_path"]))
        if sha256(path.read_bytes()).hexdigest() != item["content_hash"]:
            raise ValueError(f"patrol snapshot hash does not match report: {path}")


def record_patrol_report(
    database_url: str,
    report_path: str | Path = PATROL_REPORT,
) -> dict[str, object]:
    if os.getenv("NODE_ENV", "development") == "production":
        raise RuntimeError("patrol record refuses NODE_ENV=production")
    if os.getenv("PATROL_LOCAL_WRITE") != "1":
        raise RuntimeError("set PATROL_LOCAL_WRITE=1 to authorize operational-table writes")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("patrol record only permits localhost database hosts")
    report = json.loads(Path(report_path).read_text(encoding="utf-8"))
    written = {"capture_runs": 0, "snapshots": 0, "source_checks": 0}
    with psycopg.connect(database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM sources")
            registered = {row[0] for row in cursor.fetchall()}
            results = report.get("results", [])
            eligible = [item for item in results if item.get("source_id") in registered]
            skipped = [
                str(item["source_id"])
                for item in results
                if item.get("source_id") not in registered
            ]
            filtered_report = {**report, "results": eligible}
            validate_changed_snapshots(filtered_report)
            for run_id, items in sorted(group_runs(filtered_report).items()):
                capture_run_id = f"capture-run:patrol:{run_id}"
                cursor.execute(*capture_run_statement(run_id, items))
                written["capture_runs"] += cursor.rowcount
                for item in items:
                    snapshot_id = None
                    if item["status"] == "changed":
                        cursor.execute(*snapshot_statement(item, capture_run_id))
                        snapshot_id = cursor.fetchone()[0]
                        written["snapshots"] += cursor.rowcount
                    cursor.execute(*source_check_statement(item, capture_run_id, snapshot_id))
                    written["source_checks"] += cursor.rowcount
    return {
        "status": "recorded",
        **written,
        "skipped_unregistered": len(skipped),
        "skipped_source_ids": skipped,
        "candidates": 0,
        "approval": "not_run",
    }


if __name__ == "__main__":
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    print(json.dumps(record_patrol_report(url), ensure_ascii=False, indent=2))