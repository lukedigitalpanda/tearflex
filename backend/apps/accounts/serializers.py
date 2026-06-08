from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import transaction
from .models import Practice, Clinician, ClinicianInvite


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


class ClinicianInviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    role = serializers.ChoiceField(choices=Clinician.ROLE_CHOICES, default='clinician')

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        practice = self.context['practice']
        invited_by = self.context['invited_by']
        base_username = validated_data['email'].split('@')[0]
        username = base_username
        i = 1
        while User.objects.filter(username=username).exists():
            username = f'{base_username}{i}'
            i += 1
        user = User.objects.create(
            username=username,
            email=validated_data['email'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            is_active=False,
        )
        user.set_unusable_password()
        user.save()
        clinician = Clinician.objects.create(
            user=user, practice=practice, role=validated_data['role']
        )
        invite = ClinicianInvite.objects.create(
            practice=practice, email=validated_data['email'],
            role=validated_data['role'], invited_by=invited_by, clinician=clinician,
        )
        return invite
