import httpx
import pytest

from collector.http_policy import FetchPolicyError, SafeFetcher, SourcePolicy


def policy(**kwargs):
    return SourcePolicy(source_id="source:takken:retio-exam", allowed_hosts=frozenset({"www.retio.or.jp"}), backoff_seconds=0, **kwargs)


def test_allowlist_rejects_non_https_unknown_host_and_credentials():
    fetcher = SafeFetcher(policy(), httpx.MockTransport(lambda request: httpx.Response(200)))
    with pytest.raises(FetchPolicyError): fetcher.fetch("http://www.retio.or.jp/exam/")
    with pytest.raises(FetchPolicyError): fetcher.fetch("https://evil.example/exam/")
    with pytest.raises(FetchPolicyError): fetcher.fetch("https://user:pass@www.retio.or.jp/exam/")
    fetcher.close()


def test_redirects_are_validated_and_limited():
    def handler(request):
        if request.url.path == "/exam/": return httpx.Response(302, headers={"location": "https://evil.example/"})
        return httpx.Response(200, text="ok")
    fetcher = SafeFetcher(policy(), httpx.MockTransport(handler))
    with pytest.raises(FetchPolicyError): fetcher.fetch("https://www.retio.or.jp/exam/")
    fetcher.close()


def test_timeout_policy_is_explicit():
    configured = policy()
    assert configured.timeout.connect == 5
    assert configured.timeout.read == 15
    assert configured.timeout.write == 5
    assert configured.timeout.pool == 5


def test_retries_transient_status_but_not_404():
    calls = {"count": 0}
    def handler(request):
        calls["count"] += 1
        return httpx.Response(503 if calls["count"] < 3 else 200, text="ok")
    fetcher = SafeFetcher(policy(max_retries=2), httpx.MockTransport(handler))
    result = fetcher.fetch("https://www.retio.or.jp/exam/")
    assert result.status == "ok" and result.attempts == 3
    fetcher.close()

    not_found = SafeFetcher(policy(), httpx.MockTransport(lambda request: httpx.Response(404)))
    result = not_found.fetch("https://www.retio.or.jp/exam/")
    assert result.status == "not_found" and result.attempts == 1
    not_found.close()


def test_etag_cache_uses_conditional_request_and_304_body():
    calls = []
    def handler(request):
        calls.append(request.headers)
        if len(calls) == 1: return httpx.Response(200, text="fixture", headers={"etag": '"v1"'})
        assert request.headers["If-None-Match"] == '"v1"'
        return httpx.Response(304)
    fetcher = SafeFetcher(policy(), httpx.MockTransport(handler))
    first = fetcher.fetch("https://www.retio.or.jp/exam/")
    second = fetcher.fetch("https://www.retio.or.jp/exam/")
    assert first.status == "ok" and second.status == "not_modified" and second.body == b"fixture"
    fetcher.close()


def test_404_is_a_non_mutating_failure_result():
    fetcher = SafeFetcher(policy(), httpx.MockTransport(lambda request: httpx.Response(404)))
    result = fetcher.fetch("https://www.retio.or.jp/exam/")
    assert result.status == "not_found"
    assert fetcher.cache == {}
    fetcher.close()
