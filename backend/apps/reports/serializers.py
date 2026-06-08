from rest_framework import serializers

from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ['id', 'assessment', 'generated_by', 'pdf_file', 'status', 'created_at']
        read_only_fields = ['id', 'generated_by', 'pdf_file', 'status', 'created_at']


class GenerateReportSerializer(serializers.Serializer):
    """Input for POST /api/reports/generate/."""
    assessment = serializers.IntegerField()
