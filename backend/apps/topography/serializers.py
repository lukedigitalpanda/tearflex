from rest_framework import serializers
from .models import TopographyScan, TopographyStill, TopographyResult

# Capture sends ~3-5 stills; this is an abuse guard, not a functional limit.
MAX_STILLS_PER_SCAN = 20


class TopographyResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = TopographyResult
        fields = [
            'id', 'ring_overlay', 'axial_map', 'sim_k_flat', 'sim_k_steep', 'sim_k_axis',
            'central_k', 'astigmatism_magnitude', 'astigmatism_axis', 'confidence',
            'algorithm_version', 'calibration_state', 'analysed_at',
        ]


class TopographyStillSerializer(serializers.ModelSerializer):
    class Meta:
        model = TopographyStill
        fields = ['id', 'image', 'index', 'sharpness_score', 'is_selected']


class TopographyScanSerializer(serializers.ModelSerializer):
    stills = TopographyStillSerializer(many=True, read_only=True)
    result = TopographyResultSerializer(read_only=True)

    class Meta:
        model = TopographyScan
        fields = [
            'id', 'assessment', 'video_file', 'device_model', 'phone_model_id',
            'app_version', 'camera_focal_px', 'calibration_state', 'status', 'captured_at', 'stills', 'result',
        ]
        read_only_fields = ['status', 'calibration_state', 'captured_at']


class TopographyScanCreateSerializer(serializers.ModelSerializer):
    stills = serializers.ListField(
        child=serializers.ImageField(), write_only=True, required=False, default=list,
        max_length=MAX_STILLS_PER_SCAN,
    )

    class Meta:
        model = TopographyScan
        fields = ['assessment', 'video_file', 'device_model', 'phone_model_id', 'app_version', 'camera_focal_px', 'stills']
        extra_kwargs = {'assessment': {'write_only': True}}

    def validate_camera_focal_px(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("camera_focal_px must be positive.")
        return value
