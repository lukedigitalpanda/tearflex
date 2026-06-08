from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Practice, Clinician


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


class PracticeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Practice
        fields = [
            'id', 'name', 'address_line_1', 'address_line_2', 'city',
            'postcode', 'phone', 'email', 'is_active',
            'nibut_normal_threshold', 'nibut_borderline_threshold',
        ]
        read_only_fields = ['id']


class ClinicianSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    practice = PracticeSerializer(read_only=True)

    class Meta:
        model = Clinician
        fields = ['id', 'user', 'practice', 'title', 'professional_registration', 'role', 'created_at']
        read_only_fields = ['id', 'created_at']


class MeSerializer(serializers.Serializer):
    """Current authenticated user with clinician and practice context."""
    user = UserSerializer()
    clinician = ClinicianSerializer()
