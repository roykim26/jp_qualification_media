"""Analyze captured IT Passport snapshots without writing to PostgreSQL."""

from __future__ import annotations

from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path

from collector.it_passport import extract_real_page_candidates, snapshot_from_html


CAPTURE_ROOT = Path("var/official-snapshots/it-passport")


def analyze_capture(
    report_path: str | Path = CAPTURE_ROOT / "capture-report.json",
) -> dict[str, object]:
    path = Path(report_path).resolve()
    report = json.loads(path.read_text(encoding="utf-8"))
    results: list[dict[str, object]] = []
    for captured in report["results"]:
        snapshot_path = Path(captured["snapshot_path"])
        snapshot_bytes = snapshot_path.read_bytes()
        byte_hash = sha256(snapshot_bytes).hexdigest()
        if byte_hash != captured["content_hash"]:
            raise ValueError(f"snapshot hash mismatch: {snapshot_path}")
        snapshot = snapshot_from_html(
            captured["source_id"],
            snapshot_bytes.decode("utf-8", errors="strict"),
            synthetic=False,
        )
        candidates, issues = extract_real_page_candidates(snapshot)
        results.append(
            {
                "source_id": snapshot.source_id,
                "content_hash": snapshot.content_hash,
                "candidates": [asdict(candidate) for candidate in candidates],
                "issues": [asdict(issue) for issue in issues],
            }
        )
    analysis = {
        "capture_report": str(path),
        "candidate_count": sum(len(result["candidates"]) for result in results),
        "database_write": "not_run",
        "automatic_approval": "not_run",
        "results": results,
    }
    output = path.parent / "analysis-report.json"
    output.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return analysis


if __name__ == "__main__":
    print(json.dumps(analyze_capture(), ensure_ascii=False, indent=2))
