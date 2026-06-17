from rest_framework import serializers

from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    patient = serializers.IntegerField(source='assessment.patient_id', read_only=True)
    eye = serializers.CharField(source='assessment.eye', read_only=True)
    assessed_at = serializers.DateTimeField(source='assessment.assessed_at', read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'assessment', 'patient', 'eye', 'assessed_at',
            'generated_by', 'pdf_file', 'status', 'generation_attempts', 'created_at',
        ]
        read_only_fields = [
            'id', 'patient', 'eye', 'assessed_at',
            'generated_by', 'pdf_file', 'status', 'generation_attempts', 'created_at',
        ]


class GenerateReportSerializer(serializers.Serializer):
    """Input for POST /api/reports/generate/."""
    assessment = serializers.IntegerField()
