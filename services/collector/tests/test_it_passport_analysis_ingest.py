from collector.ingest_it_passport_analysis import ingest_analysis


def test_real_analysis_ingest_requires_explicit_authorization(monkeypatch):
    monkeypatch.delenv("IT_PASSPORT_REAL_CANDIDATE_WRITE", raising=False)
    try:
        ingest_analysis("postgresql://localhost/db")
    except RuntimeError as error:
        assert "IT_PASSPORT_REAL_CANDIDATE_WRITE" in str(error)
    else:
        raise AssertionError("real candidate ingest must require authorization")


def test_real_analysis_ingest_refuses_nonlocal_database(monkeypatch):
    monkeypatch.setenv("IT_PASSPORT_REAL_CANDIDATE_WRITE", "1")
    try:
        ingest_analysis("postgresql://production.example/db")
    except RuntimeError as error:
        assert "localhost" in str(error)
    else:
        raise AssertionError("real candidate ingest must refuse nonlocal databases")
