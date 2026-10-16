import pytest
from cloud.pipeline import validate_correction, validate_chapters, vtt

CUES = [{'id': 's1', 'start': 1.1, 'end': 3.2, 'text': '刚度矩阵', 'reviewed': False}]


def test_model_cannot_change_timing_or_ids():
    result = validate_correction(CUES, {'cues': [{'id': 's1', 'text': '刚度矩阵。', 'start': 700}]})
    assert result[0]['start'] == 1.1 and result[0]['originalText'] == '刚度矩阵'
    with pytest.raises(ValueError):
        validate_correction(CUES, {'cues': [{'id': 'invented', 'text': '内容'}]})
    with pytest.raises(ValueError):
        validate_correction(CUES, {'cues': []})


def test_chapter_references_real_cue_only():
    assert validate_chapters(CUES, {'chapters': [{'cueId': 's1', 'title': '刚度矩阵'}]}, 10)[0]['start'] == 1.1
    with pytest.raises(ValueError):
        validate_chapters(CUES, {'chapters': [{'cueId': 'missing', 'title': '概述'}]}, 10)


def test_vtt_milliseconds():
    assert '00:00:01.100 --> 00:00:03.200' in vtt(CUES)
