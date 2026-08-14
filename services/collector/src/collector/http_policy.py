from __future__ import annotations

from dataclasses import dataclass, field
from time import sleep
from urllib.parse import urljoin, urlsplit

import httpx


class FetchPolicyError(ValueError):
    """The URL or response violates the source safety policy."""


@dataclass(frozen=True)
class SourcePolicy:
    source_id: str
    allowed_hosts: frozenset[str]
    max_redirects: int = 3
    max_bytes: int = 5 * 1024 * 1024
    timeout: httpx.Timeout = field(
        default_factory=lambda: httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0)
    )
    max_retries: int = 2
    backoff_seconds: float = 0.25

    def validate_url(self, url: str) -> str:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower().rstrip(".")
        if parsed.scheme != "https":
            raise FetchPolicyError("only HTTPS source URLs are allowed")
        if not host or host not in self.allowed_hosts:
            raise FetchPolicyError(f"host is not allowlisted: {host or '<missing>'}")
        if parsed.username or parsed.password:
            raise FetchPolicyError("source URL must not contain credentials")
        if parsed.port not in (None, 443):
            raise FetchPolicyError("source URL must use HTTPS port 443")
        return url


@dataclass(frozen=True)
class CacheEntry:
    url: str
    body: bytes
    etag: str | None = None
    last_modified: str | None = None


@dataclass(frozen=True)
class FetchResult:
    status: str
    url: str
    status_code: int | None
    body: bytes | None = None
    cache_entry: CacheEntry | None = None
    attempts: int = 1
    error: str | None = None


RETRYABLE_STATUS_CODES = frozenset({408, 425, 429, 500, 502, 503, 504})


class SafeFetcher:
    """HTTP client with explicit allowlist, redirect, timeout, retry and cache policy."""

    def __init__(self, policy: SourcePolicy, transport: httpx.BaseTransport | None = None) -> None:
        self.policy = policy
        self.cache: dict[str, CacheEntry] = {}
        self._client = httpx.Client(
            follow_redirects=False,
            timeout=policy.timeout,
            transport=transport,
            headers={"User-Agent": "jp-qualification-media/0.1 stage1-takken"},
        )

    def close(self) -> None:
        self._client.close()

    def fetch(self, url: str) -> FetchResult:
        current_url = self.policy.validate_url(url)
        redirects = 0
        attempts = 0
        while True:
            headers: dict[str, str] = {}
            cached = self.cache.get(current_url)
            if cached:
                if cached.etag:
                    headers["If-None-Match"] = cached.etag
                if cached.last_modified:
                    headers["If-Modified-Since"] = cached.last_modified
            for retry in range(self.policy.max_retries + 1):
                attempts += 1
                try:
                    response = self._client.get(current_url, headers=headers)
                except httpx.RequestError as exc:
                    if retry >= self.policy.max_retries:
                        return FetchResult("error", current_url, None, attempts=attempts, error=str(exc))
                    self._backoff(retry)
                    continue
                if response.status_code in RETRYABLE_STATUS_CODES and retry < self.policy.max_retries:
                    self._backoff(retry)
                    continue
                break

            if response.status_code == 304:
                if not cached:
                    return FetchResult("error", current_url, 304, attempts=attempts, error="304 without cached body")
                return FetchResult("not_modified", current_url, 304, cached.body, cached, attempts)
            if response.status_code == 404:
                return FetchResult("not_found", current_url, 404, attempts=attempts, error="source returned 404")
            if response.status_code in RETRYABLE_STATUS_CODES or response.is_error:
                return FetchResult("error", current_url, response.status_code, attempts=attempts, error=f"HTTP {response.status_code}")
            if response.is_redirect:
                if redirects >= self.policy.max_redirects:
                    return FetchResult("error", current_url, response.status_code, attempts=attempts, error="redirect limit exceeded")
                location = response.headers.get("location")
                if not location:
                    return FetchResult("error", current_url, response.status_code, attempts=attempts, error="redirect missing Location")
                current_url = self.policy.validate_url(urljoin(current_url, location))
                redirects += 1
                continue
            body = response.content
            if len(body) > self.policy.max_bytes:
                return FetchResult("error", current_url, response.status_code, attempts=attempts, error="response exceeds max_bytes")
            entry = CacheEntry(current_url, body, response.headers.get("etag"), response.headers.get("last-modified"))
            self.cache[current_url] = entry
            return FetchResult("ok", current_url, response.status_code, body, entry, attempts)

    def _backoff(self, retry: int) -> None:
        if self.policy.backoff_seconds:
            sleep(min(self.policy.backoff_seconds * (2**retry), 5.0))
