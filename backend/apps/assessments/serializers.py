from rest_framework import serializers
from .models import Assessment, TestCapture, TestResult


class TestResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestResult
        fields = [
            'id', 'nibut_first_breakup_seconds', 'nibut_mean_breakup_seconds',
            'nibut_heatmap', 'fluorescein_grade', 'fluorescein_breakup_seconds',
            'lipid_grade', 'lipid_thickness_nm', 'tear_meniscus_height_mm',
            'dry_eye_severity', 'confidence_score', 'analysis_version',
            'processing_time_seconds', 'analysed_at',
        ]


class TestCaptureSerializer(serializers.ModelSerializer):
    result = TestResultSerializer(read_only=True)

    class Meta:
        model = TestCapture
        fields = [
            'id', 'assessment', 'test_type', 'source', 'video_file', 'thumbnail',
            'duration_seconds', 'resolution_width', 'resolution_height',
            'fps', 'device_model', 'status', 'captured_at', 'result',
        ]
        read_only_fields = ['id', 'status', 'captured_at', 'thumbnail', 'source']


class TestCaptureUploadSerializer(serializers.ModelSerializer):
    """Serializer for video upload endpoint (auto-analysis path)."""
    source = serializers.ChoiceField(
        choices=[('mobile', 'Mobile camera'), ('upload', 'Uploaded file')],
        required=False, default='mobile',
    )

    class Meta:
        model = TestCapture
        fields = ['id', 'assessment', 'test_type', 'video_file', 'device_model', 'source']


class AssessmentSerializer(serializers.ModelSerializer):
    captures = TestCaptureSerializer(many=True, read_only=True)
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    clinician_name = serializers.CharField(source='clinician.__str__', read_only=True)

    class Meta:
        model = Assessment
        fields = [
            'id', 'patient', 'patient_name', 'clinician', 'clinician_name',
            'eye', 'notes', 'status', 'assessed_at', 'updated_at', 'captures',
        ]
        read_only_fields = ['id', 'assessed_at', 'updated_at', 'clinician']


class ManualCaptureSerializer(serializers.Serializer):
    assessment = serializers.PrimaryKeyRelatedField(queryset=Assessment.objects.all())
    test_type = serializers.ChoiceField(choices=TestCapture.TEST_TYPE_CHOICES)
    nibut_first_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    nibut_mean_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    fluorescein_grade = serializers.IntegerField(required=False, allow_null=True)
    fluorescein_breakup_seconds = serializers.FloatField(required=False, allow_null=True)
    lipid_grade = serializers.IntegerField(required=False, allow_null=True)
    lipid_thickness_nm = serializers.FloatField(required=False, allow_null=True)
    tear_meniscus_height_mm = serializers.FloatField(required=False, allow_null=True)

    def validate(self, data):
        if data.get('test_type') == 'nibut' and data.get('nibut_first_breakup_seconds') is None:
            raise serializers.ValidationError(
                {'nibut_first_breakup_seconds': 'This field is required for NIBUT tests.'}
            )
        return data


class AssessmentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    capture_count = serializers.IntegerField(source='captures.count', read_only=True)

    class Meta:
        model = Assessment
        fields = ['id', 'patient', 'patient_name', 'eye', 'status', 'assessed_at', 'capture_count']
