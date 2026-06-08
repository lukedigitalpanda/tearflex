from rest_framework import serializers
from .models import Patient


class PatientSerializer(serializers.ModelSerializer):
    latest_severity = serializers.ReadOnlyField()
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Patient
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'date_of_birth',
            'sex', 'email', 'phone', 'nhs_number', 'notes', 'is_active',
            'latest_severity', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PatientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    latest_severity = serializers.ReadOnlyField()
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Patient
        fields = ['id', 'first_name', 'last_name', 'full_name', 'date_of_birth', 'latest_severity', 'updated_at']
