import pytest

from collector.capture_bookkeeping import capture_registered_sources


def test_bookkeeping_capture_requires_explicit_authorization(monkeypatch, tmp_path):
    monkeypatch.delenv("BOOKKEEPING_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="BOOKKEEPING_LIVE_AUTHORIZED"):
        capture_registered_sources(tmp_path)
