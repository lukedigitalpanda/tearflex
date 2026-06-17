from unittest.mock import patch
from django.test import TestCase

from apps.reports.tasks import generate_report_task
from apps.reports.models import Report
from conftest import AssessmentFactory


class GenerateReportTaskTest(TestCase):

    @patch('apps.reports.tasks.generate_assessment_report')
    def test_task_calls_generate_with_report(self, mock_generate):
        report = Report.objects.create(assessment=AssessmentFactory(), status='pending')

        generate_report_task(report_id=report.pk)

        mock_generate.assert_called_once()
        assert mock_generate.call_args.args[0].pk == report.pk

    @patch('apps.reports.tasks.generate_assessment_report')
    def test_task_handles_missing_report_gracefully(self, mock_generate):
        # A non-existent report id: the task logs and returns without generating.
        generate_report_task(report_id=999999)
        mock_generate.assert_not_called()
