"""Stage only unambiguous Takken facts from directly cited capture-only pages."""
from __future__ import annotations

import json
import os
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

ROOT = Path("var/official-snapshots/takken").resolve()
SOURCE_ID = "source:takken:retio-exam"
FACTS = {
    "capture-only:takken:exam-detail": [
        ("eligibility", "text", "日本国内に居住する方であれば、年齢、学歴等に関係なく、誰でも受験できます。"),
        ("fee", "integer", "8200"), ("exam_method", "text", "paper"),
        ("exam_time", "integer", "120"), ("question_count", "integer", "50"),
        ("question_format", "text", "四肢択一式"),
    ],
    "capture-only:takken:schedule": [("application_method", "text", "インターネット、郵送"), ("exam_date", "datetime", "2026-10-18T13:00:00+09:00")],
}

def ingest(database_url: str) -> dict[str, int]:
    if os.getenv("NODE_ENV", "development") == "production" or os.getenv("TAKKEN_DIRECT_CITED_LOCAL_WRITE") != "1":
        raise RuntimeError("explicit non-production local authorization required")
    if urlsplit(database_url).hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("localhost database required")
    report = json.loads((ROOT / "directly-cited-capture-report.json").read_text(encoding="utf-8"))
    rows = {r["source_id"]: r for r in report["results"]}
    inserted = 0
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            for capture_id, facts in FACTS.items():
                r = rows[capture_id]; path = Path(r["snapshot_path"]).resolve()
                if r["status"] != "ok" or r["status_code"] != 200 or sha256(path.read_bytes()).hexdigest() != r["content_hash"]:
                    raise ValueError(f"unverified capture: {capture_id}")
                h, at = r["content_hash"], r["captured_at"]; snapshot_id = f"snapshot:takken:{h}"; run_id = f"capture-run:takken:{h}"
                cur.execute("INSERT INTO capture_runs (id,started_at,finished_at,status,request_count,collector_version) VALUES (%s,%s,%s,'succeeded',%s,'collector.capture_takken') ON CONFLICT DO NOTHING", (run_id,at,at,r["attempts"]))
                cur.execute("""INSERT INTO snapshots (id,source_id,content_hash,object_key,synthetic,retrieved_at,capture_run_id,original_url,final_url,http_status,retrieved_at_jst,collector_version) VALUES (%s,%s,%s,%s,false,%s,%s,%s,%s,%s,%s,'collector.capture_takken') ON CONFLICT (source_id,content_hash) DO UPDATE SET object_key=EXCLUDED.object_key,retrieved_at=EXCLUDED.retrieved_at,capture_run_id=EXCLUDED.capture_run_id,original_url=EXCLUDED.original_url,final_url=EXCLUDED.final_url,http_status=EXCLUDED.http_status,retrieved_at_jst=EXCLUDED.retrieved_at_jst,collector_version=EXCLUDED.collector_version""", (snapshot_id,SOURCE_ID,h,str(path),at,run_id,r["url"],r["url"],r["status_code"],at))
                cur.execute("INSERT INTO source_checks (id,source_id,capture_run_id,snapshot_id,checked_at,status,http_status,message) VALUES (%s,%s,%s,%s,%s,'changed',%s,'Captured directly cited official page; candidate staging is pending review.') ON CONFLICT DO NOTHING", (f"source-check:takken:{h}",SOURCE_ID,run_id,snapshot_id,at,r["status_code"]))
                for key, typ, value in facts:
                    evidence = {"fee":"8,200円","exam_method":"50問・四肢択一式による筆記試験です。","exam_time":"午後１時～午後３時（２時間）","question_count":"50問・四肢択一式による筆記試験です。","question_format":"50問・四肢択一式による筆記試験です。","application_method":"インターネット申込み／郵送申込み及び試験案内","exam_date":"令和8年10月18日(日)13時から15時まで（2時間）"}.get(key,value)
                    cid=f"candidate:takken:{h}:{key}"
                    cur.execute("INSERT INTO candidate_facts (id,qualification_id,exam_year,fact_key,value_type,normalized_value,display_value,evidence_text,status,risk_level,source_id,source_snapshot_id,synthetic) VALUES (%s,'qualification:takken',2026,%s,%s,%s::jsonb,%s,%s,'pending_review','high',%s,%s,false) ON CONFLICT DO NOTHING", (cid,key,typ,json.dumps(value,ensure_ascii=False),value,evidence,SOURCE_ID,snapshot_id)); inserted += cur.rowcount
    return {"candidates": inserted}

if __name__ == "__main__":
    print(json.dumps(ingest(os.environ["DATABASE_URL"]), ensure_ascii=False))
