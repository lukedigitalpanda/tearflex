from datetime import timedelta

import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone

from apps.reports.models import Report
from apps.reports.retention import purge_expired_reports
from conftest import AssessmentFactory


@pytest.mark.django_db
def test_purge_removes_reports_past_retention():
    report = Report.objects.create(assessment=AssessmentFactory(), status='ready')
    report.pdf_file.save('old.pdf', ContentFile(b'%PDF-1.4 old'), save=True)
    name = report.pdf_file.name
    report.deleted_at = timezone.now() - timedelta(days=Report.RETENTION_DAYS + 1)
    report.save(update_fields=['deleted_at'])

    assert purge_expired_reports() == 1
    assert not Report.objects.filter(pk=report.pk).exists()
    assert not default_storage.exists(name)  # PDF removed too


@pytest.mark.django_db
def test_purge_keeps_recent_and_active_reports():
    recent = Report.objects.create(
        assessment=AssessmentFactory(), status='ready',
        deleted_at=timezone.now() - timedelta(days=5),
    )
    active = Report.objects.create(assessment=AssessmentFactory(), status='ready')

    assert purge_expired_reports() == 0
    assert Report.objects.filter(pk=recent.pk).exists()
    assert Report.objects.filter(pk=active.pk).exists()
