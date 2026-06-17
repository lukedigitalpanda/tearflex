import logging

from django.http import FileResponse
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from apps.assessments.models import Assessment
from .access import user_is_report_admin
from .models import Report
from .retention import purge_expired_reports
from .serializers import GenerateReportSerializer, ReportSerializer
from .tasks import generate_report_task

logger = logging.getLogger(__name__)


class PracticeScopedReportMixin:
    permission_classes = [permissions.IsAuthenticated]

    def base_queryset(self):
        """Practice/role/patient-scoped reports, ignoring soft-delete state."""
        qs = Report.objects.select_related('assessment', 'generated_by')
        if not self.request.user.is_superuser:
            qs = qs.filter(assessment__patient__practice=self.request.user.clinician.practice)
        if not user_is_report_admin(self.request.user):
            qs = qs.filter(status='ready')
        patient = self.request.query_params.get('patient')
        if patient:
            qs = qs.filter(assessment__patient_id=patient)
        return qs

    def get_queryset(self):
        # Active (non-deleted) reports by default.
        return self.base_queryset().filter(deleted_at__isnull=True)


class ReportListView(PracticeScopedReportMixin, generics.ListAPIView):
    serializer_class = ReportSerializer

    def list(self, request, *args, **kwargs):
        # Opportunistically remove reports past their recovery window.
        purge_expired_reports()
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        # ?deleted=true returns the recoverable (soft-deleted) reports — admins only.
        if self.request.query_params.get('deleted') == 'true' and user_is_report_admin(self.request.user):
            return self.base_queryset().filter(deleted_at__isnull=False)
        return self.base_queryset().filter(deleted_at__isnull=True)


class GenerateReportView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GenerateReportSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assessment_pk = serializer.validated_data['assessment']

        if request.user.is_superuser:
            assessment = Assessment.objects.filter(pk=assessment_pk).first()
        else:
            assessment = Assessment.objects.filter(
                pk=assessment_pk,
                patient__practice=request.user.clinician.practice,
            ).first()

        if not assessment:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # One report per assessment: reuse the existing row (regenerate in place)
        # rather than accumulating duplicates. A re-run of the test is a new
        # Assessment and so gets its own report.
        report, created = Report.objects.get_or_create(
            assessment=assessment,
            defaults={'generated_by': request.user.clinician, 'status': 'pending'},
        )
        if not created:
            # A generation is already in flight — don't queue a duplicate.
            if report.status == 'pending' and report.deleted_at is None:
                return Response(ReportSerializer(report).data, status=status.HTTP_202_ACCEPTED)
            # Re-queue (also recovers a soft-deleted report). Keep the existing
            # pdf_file so the current report stays downloadable until the new one
            # is ready (the worker swaps it on success).
            report.generated_by = request.user.clinician
            report.status = 'pending'
            report.generation_attempts = 0
            report.deleted_at = None
            report.save(update_fields=['generated_by', 'status', 'generation_attempts', 'deleted_at'])

        generate_report_task.delay(report_id=report.pk)

        return Response(ReportSerializer(report).data, status=status.HTTP_202_ACCEPTED)


class RetryReportView(PracticeScopedReportMixin, generics.GenericAPIView):
    """Force a fresh generation attempt for a stuck/failed report.

    Restricted to superusers and practice admins; resets the attempt counter so
    the report gets a clean budget of MAX_GENERATION_ATTEMPTS tries again.
    """
    serializer_class = ReportSerializer

    def post(self, request, pk):
        if not user_is_report_admin(request.user):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        report = self.get_queryset().filter(pk=pk).first()
        if report is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        report.status = 'pending'
        report.generation_attempts = 0
        report.save(update_fields=['status', 'generation_attempts'])
        logger.info("Manual retry queued for report %s by user %s", report.pk, request.user.pk)
        generate_report_task.delay(report_id=report.pk)
        return Response(ReportSerializer(report).data, status=status.HTTP_202_ACCEPTED)


class DeleteReportView(PracticeScopedReportMixin, generics.GenericAPIView):
    """Soft-delete a report (recoverable for RETENTION_DAYS, then purged).

    Restricted to superusers and practice admins. The PDF is kept so the report
    can be restored; it is removed only when the report is permanently purged.
    """
    serializer_class = ReportSerializer

    def delete(self, request, pk):
        if not user_is_report_admin(request.user):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        report = self.get_queryset().filter(pk=pk).first()
        if report is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        report.deleted_at = timezone.now()
        report.save(update_fields=['deleted_at'])
        logger.info(
            "Report %s (assessment %s) soft-deleted by user %s",
            report.pk, report.assessment_id, request.user.pk,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class RestoreReportView(PracticeScopedReportMixin, generics.GenericAPIView):
    """Recover a soft-deleted report (superusers / practice admins only)."""
    serializer_class = ReportSerializer

    def post(self, request, pk):
        if not user_is_report_admin(request.user):
            return Response({'detail': 'Not permitted.'}, status=status.HTTP_403_FORBIDDEN)
        report = self.base_queryset().filter(pk=pk, deleted_at__isnull=False).first()
        if report is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        report.deleted_at = None
        report.save(update_fields=['deleted_at'])
        logger.info("Report %s restored by user %s", report.pk, request.user.pk)
        return Response(ReportSerializer(report).data, status=status.HTTP_200_OK)


class DownloadReportView(PracticeScopedReportMixin, generics.GenericAPIView):
    serializer_class = ReportSerializer

    def get(self, request, pk):
        report = self.get_queryset().filter(pk=pk).first()
        if report is None or not report.pdf_file:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(
            report.pdf_file.open('rb'),
            content_type='application/pdf',
            as_attachment=True,
            filename=f'tearflex_report_{report.id}.pdf',
        )
