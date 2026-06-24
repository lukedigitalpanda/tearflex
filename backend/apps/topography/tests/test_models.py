import pytest
from conftest import AssessmentFactory
from apps.topography.models import TopographyScan, TopographyStill, TopographyResult


@pytest.mark.django_db
def test_scan_creation_defaults():
    assessment = AssessmentFactory()
    scan = TopographyScan.objects.create(assessment=assessment)
    assert scan.status == 'uploaded'
    assert scan.calibration_state == 'uncalibrated'
    assert scan.assessment_id == assessment.id


@pytest.mark.django_db
def test_still_and_result_relations():
    assessment = AssessmentFactory()
    scan = TopographyScan.objects.create(assessment=assessment)
    still = TopographyStill.objects.create(scan=scan, image='topography/stills/x.png', index=0)
    result = TopographyResult.objects.create(
        scan=scan, sim_k_steep=44.0, sim_k_flat=42.0,
        algorithm_version='topo-v0.1', calibration_state='uncalibrated',
    )
    assert list(scan.stills.all()) == [still]
    assert scan.result == result
    assert scan.result.astigmatism_magnitude is None
