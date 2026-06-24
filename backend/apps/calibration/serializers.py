from rest_framework import serializers
from .models import DeviceCalibration


class DeviceCalibrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceCalibration
        fields = [
            'id', 'phone_model_id', 'device_model', 'attachment_id', 'method',
            'camera_intrinsics', 'attachment_geometry', 'solve_result',
            'calibration_version', 'is_active', 'created_at',
        ]
        read_only_fields = ['calibration_version', 'created_at']
