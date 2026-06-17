from rest_framework import serializers

from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    patient = serializers.IntegerField(source='assessment.patient_id', read_only=True)
    eye = serializers.CharField(source='assessment.eye', read_only=True)
    assessed_at = serializers.DateTimeField(source='assessment.assessed_at', read_only=True)

    class Meta:
        model = Report
        # pdf_file is intentionally NOT exposed: DRF would render it as an
        # absolute URL built from the internal request host (e.g.
        # http://backend:8000/media/...), which is unreachable from a browser.
        # PDFs are served via /api/download/{id} instead.
        fields = [
            'id', 'assessment', 'patient', 'eye', 'assessed_at',
            'generated_by', 'status', 'generation_attempts', 'created_at',
        ]
        read_only_fields = [
            'id', 'patient', 'eye', 'assessed_at',
            'generated_by', 'status', 'generation_attempts', 'created_at',
        ]


class GenerateReportSerializer(serializers.Serializer):
    """Input for POST /api/reports/generate/."""
    assessment = serializers.IntegerField()
