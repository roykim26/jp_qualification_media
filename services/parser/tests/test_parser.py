import pytest
from pydantic import ValidationError

from parser import ParsedCandidate

BASE = {
    'fact_key': 'exam_date',
    'exam_year': 2026,
    'value_type': 'date',
    'normalized_value': '2026-10-18',
    'display_value': '2026年10月18日',
    'source_id': 'source:takken:retio-exam',
    'source_snapshot_id': 'snapshot:abcdef',
}


def test_parser_candidate_is_explicitly_synthetic_by_default():
    item = ParsedCandidate(**BASE)
    assert item.synthetic is True


@pytest.mark.parametrize('field', ['source_id', 'source_snapshot_id', 'fact_key'])
def test_parser_candidate_requires_non_empty_provenance(field):
    with pytest.raises(ValidationError):
        ParsedCandidate(**{**BASE, field: ''})

    without = dict(BASE)
    without.pop(field)
    with pytest.raises(ValidationError):
        ParsedCandidate(**without)


def test_parser_candidate_rejects_values_outside_shared_enums():
    for field, bad in (
        ('value_type', 'timestamp'),
        ('status', 'published'),
        ('risk_level', 'severe'),
    ):
        with pytest.raises(ValidationError):
            ParsedCandidate(**{**BASE, field: bad})


def test_parser_candidate_keeps_full_fact_identity_dims():
    item = ParsedCandidate(
        **{
            **BASE,
            'provider_id': 'provider:x',
            'exam_level_id': 'qualification:takken',
            'exam_component': 'registration',
            'delivery_mode': 'cbt',
            'payment_method': 'convenience_store',
            'synthetic': False,
        }
    )
    assert item.payment_method == 'convenience_store'
    assert item.synthetic is False


def test_parser_candidate_forbids_unknown_fields():
    with pytest.raises(ValidationError):
        ParsedCandidate(**{**BASE, 'confidence': 0.9})
