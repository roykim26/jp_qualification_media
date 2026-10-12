import hashlib
import json
import re

import pytest

from collector import ingest_bookkeeping, precheck_bookkeeping
from collector.precheck_bookkeeping import (
    Breakdown,
    Report,
    approved_keys,
    check_source,
    main,
    planned_rows,
)

NET_HTML = """
<html><body>
<h2>2級</h2>
<table>
  <tr><th>期間</th><th>受験者数</th><th>合格者数</th><th>合格率</th></tr>
  <tr><td>2026年4月～2026年6月</td><td>33,659名</td><td>10,749名</td><td>31.9%</td></tr>
</table>
<h2>3級</h2>
<table>
  <tr><th>期間</th><th>受験者数</th><th>合格者数</th><th>合格率</th></tr>
  <tr><td>2025年4月～2026年3月</td><td>141,072名</td><td>46,351名</td><td>32.9%</td></tr>
</table>
</body></html>
"""

SOURCE_ID = "source:bookkeeping:candidate-data-class23-net"


def snapshot_hash(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


@pytest.fixture
def staged(tmp_path, monkeypatch):
    """Put one HTML page plus a matching capture report under a temp snapshot root."""
    root = tmp_path / "bookkeeping"
    root.mkdir()
    body = NET_HTML.encode("utf-8")
    page = root / "candidate-data-class23-net.html"
    page.write_bytes(body)
    report = {
        "results": [
            {
                "source_id": SOURCE_ID,
                "status": "ok",
                "status_code": 200,
                "content_hash": snapshot_hash(body),
                "captured_at": "2026-10-12T00:52:00+00:00",
                "snapshot_path": str(page),
                "url": "https://www.kentei.ne.jp/bookkeeping/candidate-data-net",
                "attempts": 1,
            }
        ]
    }
    (root / "capture-report.json").write_text(json.dumps(report), encoding="utf-8")
    monkeypatch.setattr(ingest_bookkeeping, "SNAPSHOT_ROOT", root.resolve())
    monkeypatch.setattr(precheck_bookkeeping, "SNAPSHOT_ROOT", root.resolve())
    return {"root": root.resolve(), "page": page, "body": body}


class FakeCursor:
    """Answers only the SELECTs the precheck issues, from in-memory rows."""

    def __init__(
        self,
        *,
        registered=True,
        stored_current=(),
        stored_total=None,
        ids_in_table=(),
        approved_rows=(),
    ):
        self.registered = registered
        self.stored_current = list(stored_current)
        self.stored_total = len(self.stored_current) if stored_total is None else stored_total
        self.ids_in_table = list(ids_in_table)
        self.approved_rows = list(approved_rows)
        self._rows: list = []

    def execute(self, sql, params=None):
        normalized = " ".join(sql.split())
        if "FROM sources WHERE id=" in normalized:
            self._rows = [(1,)] if self.registered else []
        elif "id = ANY(" in normalized:
            wanted = set(params[0])
            self._rows = [(row_id,) for row_id in self.ids_in_table if row_id in wanted]
        elif "count(*)::int FROM candidate_facts" in normalized:
            self._rows = [(self.stored_total,)]
        elif "AND source_snapshot_id=" in normalized:
            self._rows = [(row_id,) for row_id in self.stored_current]
        elif "status='approved'" in normalized:
            self._rows = self.approved_rows
        else:
            raise AssertionError("unexpected query: " + normalized)
        return self

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


def codes(report: Report) -> list[str]:
    return [finding.code for finding in report.findings]


def test_planned_rows_uses_legacy_id_shape_and_value_keys(staged):
    body = staged["body"]
    planned, issue_codes = planned_rows(body, SOURCE_ID, snapshot_hash(body))
    assert issue_codes == []
    # 2 header-transcription facts + one row per level with 合格者数 and 合格率.
    assert len(planned) == 6
    for row_id, row in planned.items():
        assert row_id.startswith(f"candidate:bookkeeping:{snapshot_hash(body)}:bookkeeping:")
        assert re.search(r":(unified|network):\d{1,3}:", row_id) is None  # net rows add no 回 segment
        assert row_id == row.candidate_id
        assert len(row.dedup_key) == 7
        assert row.dedup_key[3] == "None"
    assert sorted({row.dedup_key[4] for row in planned.values()}) == ["2025", "2026"]


def test_unregistered_source_blocks(staged):
    report = Report()
    check_source(FakeCursor(registered=False), report, set(), "candidate-data-class23-net.html", SOURCE_ID)
    assert "unregistered_source" in codes(report)
    assert report.blocking


def test_approved_values_are_skipped_so_a_re_run_stages_nothing(staged):
    body = staged["body"]
    planned, _ = planned_rows(body, SOURCE_ID, snapshot_hash(body))
    # candidate_facts without the 0017 column answers the precheck's fallback query.
    approved_rows = [
        (key[0], key[1], key[2], int(key[4]), key[5], key[6])
        for key in (row.dedup_key for row in planned.values())
    ]
    cursor = FakeCursor(approved_rows=approved_rows)
    approved = approved_keys(cursor, session_column_present=False)
    report = Report()
    check_source(cursor, report, approved, "candidate-data-class23-net.html", SOURCE_ID)
    assert codes(report) == ["staged_delta"]
    assert report.would_stage == 0
    assert report.skipped_approved == len(planned)


def test_older_generations_are_info_but_current_generation_drift_blocks(staged):
    report = Report()
    check_source(
        FakeCursor(
            stored_current=["candidate:bookkeeping:deadbeef:bookkeeping:2:network:passed:000000000000"],
            stored_total=51,
        ),
        report,
        set(),
        "candidate-data-class23-net.html",
        SOURCE_ID,
    )
    assert "id_drift" in codes(report)
    delta = next(finding for finding in report.findings if finding.code == "staged_delta")
    assert "other generations=50" in delta.detail


def test_hash_mismatch_against_capture_report_blocks(staged):
    staged["page"].write_bytes(b"<html><body>changed after capture</body></html>")
    report = Report()
    check_source(FakeCursor(), report, set(), "candidate-data-class23-net.html", SOURCE_ID)
    assert "hash_mismatch" in codes(report)
    assert report.would_stage == 0


def test_breakdown_aggregates_only_the_rows_that_would_stage(staged):
    body = staged["body"]
    planned, _ = planned_rows(body, SOURCE_ID, snapshot_hash(body))
    report = Report(breakdown=Breakdown())
    check_source(FakeCursor(), report, set(), "candidate-data-class23-net.html", SOURCE_ID)

    breakdown = report.breakdown
    assert breakdown.total == report.would_stage == len(planned) == 6
    assert dict(breakdown.by_source) == {SOURCE_ID: 6}
    assert dict(breakdown.by_risk_level) == {"high": 6}
    assert sum(breakdown.by_fact_key.values()) == 6
    assert sum(breakdown.by_value_type.values()) == 6
    # Net rows carry no 回 session, so the session dimension stays empty for them.
    assert breakdown.sessions == {}
    assert dict(breakdown.by_level) == {"bookkeeping:2/network": 3, "bookkeeping:3/network": 3}
    assert dict(breakdown.by_fact_key) == {"statistics_methodology": 2, "passed": 2, "pass_rate": 2}
    assert dict(breakdown.by_value_type) == {"text": 2, "integer": 2, "decimal": 2}
    assert breakdown.years == {
        "bookkeeping:2/network": {2026},
        "bookkeeping:3/network": {2025, 2026},  # 2026 is the header row's DEFAULT_EXAM_YEAR
    }

    rendered = breakdown.format()
    assert f"breakdown of the {breakdown.total} rows ingest would newly stage:" in rendered
    assert f"  {SOURCE_ID}: 6" in rendered
    for label in ("by source", "by level/delivery", "by fact_key", "by risk_level", "by value_type"):
        assert f"-- {label}" in rendered


def test_breakdown_leaves_out_values_already_approved(staged):
    body = staged["body"]
    planned, _ = planned_rows(body, SOURCE_ID, snapshot_hash(body))
    approved_rows = [
        (key[0], key[1], key[2], int(key[4]), key[5], key[6])
        for key in (row.dedup_key for row in planned.values())
    ]
    cursor = FakeCursor(approved_rows=approved_rows)
    report = Report(breakdown=Breakdown())
    check_source(
        cursor,
        report,
        approved_keys(cursor, session_column_present=False),
        "candidate-data-class23-net.html",
        SOURCE_ID,
    )
    assert report.breakdown.total == 0
    assert report.breakdown.by_source == {}


def test_unknown_argument_exits_two_without_touching_the_database(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert main(["--brokendown"]) == 2
    assert main(["--breakdown"]) == 2  # flag itself is fine; only the missing DATABASE_URL blocks
