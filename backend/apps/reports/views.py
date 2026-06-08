from django.http import FileResponse
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from apps.assessments.models import Assessment
from .generators import generate_assessment_report
from .models import Report
from .serializers import GenerateReportSerializer, ReportSerializer


class PracticeScopedReportMixin:
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        practice = self.request.user.clinician.practice
        return Report.objects.select_related('assessment', 'generated_by').filter(
            assessment__patient__practice=practice
        )


class ReportListView(PracticeScopedReportMixin, generics.ListAPIView):
    serializer_class = ReportSerializer


class GenerateReportView(generics.GenericAPIView):
    serializer_class = GenerateReportSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        practice = request.user.clinician.practice
        try:
            assessment = Assessment.objects.get(
                pk=serializer.validated_data['assessment'],
                patient__practice=practice,
            )
        except Assessment.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        report = generate_assessment_report(assessment)
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


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
