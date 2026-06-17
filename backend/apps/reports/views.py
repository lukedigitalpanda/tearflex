import logging

from django.http import FileResponse
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from apps.assessments.models import Assessment
from .models import Report
from .serializers import GenerateReportSerializer, ReportSerializer
from .tasks import generate_report_task

logger = logging.getLogger(__name__)


def user_can_see_unfinished_reports(user) -> bool:
    """Superusers and practice admins may see pending/failed reports and retry
    them. Ordinary clinicians/technicians only ever see finished ('ready') ones."""
    if user.is_superuser:
        return True
    clinician = getattr(user, 'clinician', None)
    return bool(clinician and clinician.role == 'admin')


class PracticeScopedReportMixin:
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Report.objects.select_related('assessment', 'generated_by')
        if not self.request.user.is_superuser:
            qs = qs.filter(assessment__patient__practice=self.request.user.clinician.practice)
        if not user_can_see_unfinished_reports(self.request.user):
            qs = qs.filter(status='ready')
        patient = self.request.query_params.get('patient')
        if patient:
            qs = qs.filter(assessment__patient_id=patient)
        return qs


class ReportListView(PracticeScopedReportMixin, generics.ListAPIView):
    serializer_class = ReportSerializer


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

        report = Report.objects.create(
            assessment=assessment,
            generated_by=request.user.clinician,
            status='pending',
        )

        generate_report_task.delay(report_id=report.pk)

        return Response(ReportSerializer(report).data, status=status.HTTP_202_ACCEPTED)


class RetryReportView(PracticeScopedReportMixin, generics.GenericAPIView):
    """Force a fresh generation attempt for a stuck/failed report.

    Restricted to superusers and practice admins; resets the attempt counter so
    the report gets a clean budget of MAX_GENERATION_ATTEMPTS tries again.
    """
    serializer_class = ReportSerializer

    def post(self, request, pk):
        if not user_can_see_unfinished_reports(request.user):
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
