import pytest

from collector.capture_gyoseishoshi import capture_registered_sources


def test_gyoseishoshi_capture_requires_explicit_authorization(monkeypatch, tmp_path):
    monkeypatch.delenv("GYOSEISHOSHI_LIVE_AUTHORIZED", raising=False)
    with pytest.raises(RuntimeError, match="GYOSEISHOSHI_LIVE_AUTHORIZED"):
        capture_registered_sources(tmp_path)
