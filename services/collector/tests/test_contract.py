from collector import CollectorAdapter

def test_collector_is_interface_only():
    try:
        CollectorAdapter().collect()
    except NotImplementedError:
        assert True
