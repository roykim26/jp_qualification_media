from pathlib import Path

from collector.ingest_gyoseishoshi import ingest_snapshot


def test_gyoseishoshi_ingest_requires_explicit_local_write(monkeypatch):
    monkeypatch.delenv("GYOSEISHOSHI_LOCAL_WRITE", raising=False)
    path = Path("var/official-snapshots/gyoseishoshi/guide.html")
    try:
        ingest_snapshot("postgresql://localhost/db", "source:gyoseishoshi:guide", path, 2026)
    except RuntimeError as error:
        assert "GYOSEISHOSHI_LOCAL_WRITE" in str(error)
    else:
        raise AssertionError("ingest must require explicit local authorization")
