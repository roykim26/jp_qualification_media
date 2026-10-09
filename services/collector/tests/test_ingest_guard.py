import os

import pytest

from collector.ingest_takken import ingest_local, ingest_snapshot


def test_ingest_requires_explicit_local_write(monkeypatch):
    monkeypatch.delenv("STAGE1_LOCAL_WRITE", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://qualification_dev:qualification_dev@localhost:5432/qualification_media")
    with pytest.raises(RuntimeError, match="STAGE1_LOCAL_WRITE"):
        ingest_local()


def test_offline_takken_snapshot_requires_explicit_local_write(monkeypatch):
    monkeypatch.delenv("STAGE1_LOCAL_WRITE", raising=False)
    with pytest.raises(RuntimeError, match="STAGE1_LOCAL_WRITE"):
        ingest_snapshot(
            "postgresql://qualification_dev:qualification_dev@localhost:5432/qualification_media",
            "var/official-snapshots/takken/does-not-matter.html",
        )
