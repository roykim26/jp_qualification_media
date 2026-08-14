from parser import ParsedCandidate

def test_parser_candidate_is_explicitly_synthetic_by_default():
    item = ParsedCandidate(fact_key='test_only', value_type='text', normalized_value='fixture', display_value='fixture')
    assert item.synthetic is True
