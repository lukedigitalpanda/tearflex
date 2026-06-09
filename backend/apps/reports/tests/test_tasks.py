from unittest.mock import patch, MagicMock
from django.test import TestCase
from apps.reports.tasks import generate_report_task


class GenerateReportTaskTest(TestCase):

    @patch('apps.reports.tasks.generate_assessment_report')
    @patch('apps.reports.tasks.Assessment.objects.get')
    def test_task_calls_generate_with_correct_assessment(self, mock_get, mock_generate):
        mock_assessment = MagicMock()
        mock_get.return_value = mock_assessment
        mock_generate.return_value = MagicMock()

        generate_report_task(assessment_id=42)

        mock_get.assert_called_once_with(pk=42)
        mock_generate.assert_called_once_with(mock_assessment)

    @patch('apps.reports.tasks.generate_assessment_report')
    @patch('apps.reports.tasks.Assessment.objects.get')
    def test_task_handles_missing_assessment_gracefully(self, mock_get, mock_generate):
        from django.core.exceptions import ObjectDoesNotExist
        mock_get.side_effect = ObjectDoesNotExist()

        # Should not raise
        generate_report_task(assessment_id=999)
        mock_generate.assert_not_called()
