import pytest

from collector.capture_fp import capture_registered_sources


def test_fp_capture_requires_explicit_authorization(monkeypatch):
    monkeypatch.delenv("FP_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="FP_LIVE_AUTHORIZED"):
        capture_registered_sources("var/fp-unauthorized-test")
