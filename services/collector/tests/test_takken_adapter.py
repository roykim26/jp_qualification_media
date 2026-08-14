import httpx

from collector.http_policy import SafeFetcher, SourcePolicy
from collector.takken import extract_navigation_links, extract_schedule_candidates, fetch_takken_snapshot, snapshot_from_html, extract_target_fields


def test_takken_fixture_adapter_extracts_declared_fields_only():
    snapshot = snapshot_from_html('<main><time data-fact-key="exam_date">2099-10-01</time><p>layout-only</p></main>')
    assert snapshot.synthetic is True
    assert extract_target_fields(snapshot) == {"exam_date": "2099-10-01"}


def test_404_does_not_create_takken_snapshot():
    fetcher = SafeFetcher(
        SourcePolicy(source_id="source:takken:retio-exam", allowed_hosts=frozenset({"www.retio.or.jp"}), backoff_seconds=0),
        httpx.MockTransport(lambda request: httpx.Response(404)),
    )
    assert fetch_takken_snapshot(fetcher) is None
    assert fetcher.cache == {}
    fetcher.close()


def test_real_page_shape_yields_registered_same_host_links_only():
    snapshot = snapshot_from_html(
        '<a href="/exam/schedule/">schedule</a><a href="/exam/exam_detail">overview</a><a href="https://moushikomi.retio.or.jp/">external application</a>'
    )
    assert extract_navigation_links(snapshot) == {
        "schedule": "https://www.retio.or.jp/exam/schedule/",
        "exam_overview": "https://www.retio.or.jp/exam/exam_detail",
    }
    assert extract_target_fields(snapshot) == {}


def test_schedule_dates_become_high_risk_jst_candidates_without_approval():
    snapshot = snapshot_from_html(
        '<h2>令和８年度宅地建物取引士資格試験について</h2>'
        '<h3>インターネット申込み</h3><p>令和8年7月1日(水)9時30分から7月31日(金)23時59分まで</p>'
        '<h3>試験日時</h3><p>令和8年10月18日(日)午後1時から</p>'
        '<h3>合格発表</h3><p>令和8年12月2日(水)</p>'
    )
    candidates = extract_schedule_candidates(snapshot)
    assert [candidate.fact_key for candidate in candidates] == ['application_open_online', 'application_deadline_online', 'exam_date', 'result_date']
    assert candidates[0].normalized_value == '2026-07-01T09:30:00+09:00'
    assert all(candidate.risk_level == 'high' and candidate.status == 'pending_review' for candidate in candidates)
    assert all(candidate.synthetic for candidate in candidates)
