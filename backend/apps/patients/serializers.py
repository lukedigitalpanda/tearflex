from datetime import date

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

    def validate_date_of_birth(self, value):
        if value > date.today():
            raise serializers.ValidationError('Date of birth cannot be in the future.')
        return value


class PatientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    latest_severity = serializers.ReadOnlyField()
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Patient
        fields = ['id', 'first_name', 'last_name', 'full_name', 'date_of_birth', 'latest_severity', 'updated_at']
