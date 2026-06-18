from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.conf import settings as django_settings
from django.db import transaction
from django.utils import timezone
from .models import Practice, Clinician, ClinicianInvite, PasswordResetToken, OnboardingRegistration
from .management import manageable_roles, can_manage, is_last_active_admin
from .scoping import accessible_practice_ids


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


class PracticeCreateSerializer(serializers.ModelSerializer):
    """Write-only practice creation. `chain` is set by the view, not the client."""
    class Meta:
        model = Practice
        fields = [
            'id', 'name', 'address_line_1', 'address_line_2', 'city',
            'postcode', 'phone', 'email',
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
        user = User.objects.filter(email=value).first()
        if user and user.is_active:
            raise serializers.ValidationError('A clinician with this email is already registered.')
        # Inactive user = pending unaccepted invite; allow re-invite (cleaned up in create)
        return value

    def validate(self, attrs):
        role = attrs.get('role', 'clinician')
        if role not in manageable_roles(self.context['actor_user']):
            raise serializers.ValidationError(
                {'role': 'You do not have permission to invite this role.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        practice = self.context['practice']
        invited_by = self.context['invited_by']

        # Remove any stale pending invite for this email before creating a fresh one
        existing_user = User.objects.filter(email=validated_data['email'], is_active=False).first()
        if existing_user:
            try:
                clinician = existing_user.clinician
                ClinicianInvite.objects.filter(clinician=clinician).delete()
                clinician.delete()
            except Clinician.DoesNotExist:
                pass
            existing_user.delete()

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


class ClinicianManageSerializer(serializers.Serializer):
    """Edit a clinician's details, role, and/or practice (move). Caller provides
    `actor_user` and `target` (the Clinician) in context."""
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    title = serializers.CharField(max_length=20, required=False, allow_blank=True)
    professional_registration = serializers.CharField(max_length=50, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Clinician.ROLE_CHOICES, required=False)
    practice_id = serializers.IntegerField(required=False)

    def validate_role(self, value):
        if value not in manageable_roles(self.context['actor_user']):
            raise serializers.ValidationError('You cannot assign this role.')
        return value

    def validate_practice_id(self, value):
        scope = accessible_practice_ids(self.context['actor_user'])
        if scope is not None and value not in scope:
            raise serializers.ValidationError('That practice is outside your scope.')
        return value

    def validate(self, attrs):
        target = self.context['target']
        new_role = attrs.get('role', target.role)
        new_practice = attrs.get('practice_id', target.practice_id)
        leaving_admin = target.role == 'admin' and (
            new_role != 'admin' or new_practice != target.practice_id)
        if leaving_admin and is_last_active_admin(target):
            raise serializers.ValidationError(
                'This is the last admin of the practice; assign another admin first.')
        return attrs

    def save(self):
        target = self.context['target']
        data = self.validated_data
        user = target.user
        if 'first_name' in data:
            user.first_name = data['first_name']
        if 'last_name' in data:
            user.last_name = data['last_name']
        user.save()
        for field in ('title', 'professional_registration', 'role'):
            if field in data:
                setattr(target, field, data[field])
        if 'practice_id' in data:
            target.practice_id = data['practice_id']
        target.save()
        return target


class ClinicianRegisterSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, write_only=True)

    def validate_token(self, value):
        try:
            invite = ClinicianInvite.objects.select_related('clinician__user').get(token=value)
        except ClinicianInvite.DoesNotExist:
            raise serializers.ValidationError('Invalid or expired invite token.')
        if invite.accepted_at is not None:
            raise serializers.ValidationError('This invite has already been used.')
        self._invite = invite
        return value

    @transaction.atomic
    def save(self):
        invite = self._invite
        user = invite.clinician.user
        user.set_password(self.validated_data['password'])
        user.is_active = True
        user.save()
        invite.accepted_at = timezone.now()
        invite.save()
        return invite.clinician


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        self._user = User.objects.filter(email=value, is_active=True).first()
        return value

    def save(self):
        user = getattr(self, '_user', None)
        if not user:
            return  # Silent — do not reveal whether email exists
        PasswordResetToken.objects.filter(user=user, used_at__isnull=True).delete()
        token = PasswordResetToken.objects.create(user=user)
        reset_url = f"{django_settings.FRONTEND_URL}/reset-password?token={token.token}"
        name = user.first_name or user.username
        send_mail(
            subject='Reset your TearFlex password',
            message=(
                f"Hi {name},\n\n"
                f"Click the link below to reset your TearFlex password. "
                f"This link expires in 1 hour.\n\n"
                f"{reset_url}\n\n"
                f"If you didn't request this, you can safely ignore this email.\n\n"
                f"TearFlex"
            ),
            from_email=django_settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, write_only=True)

    def validate_token(self, value):
        try:
            reset_token = PasswordResetToken.objects.select_related('user').get(token=value)
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError('Invalid or expired reset link.')
        if not reset_token.is_valid():
            raise serializers.ValidationError('This reset link has expired or has already been used.')
        self._reset_token = reset_token
        return value

    @transaction.atomic
    def save(self):
        token = self._reset_token
        user = token.user
        user.set_password(self.validated_data['password'])
        user.save()
        token.used_at = timezone.now()
        token.save()


class ChangePasswordSerializer(serializers.Serializer):
    """Authenticated self-service password change. Requires the current password."""
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user


class OnboardingSubmitSerializer(serializers.Serializer):
    registration_type = serializers.ChoiceField(choices=['practice', 'chain'])
    contact_first_name = serializers.CharField(max_length=100)
    contact_last_name = serializers.CharField(max_length=100)
    contact_email = serializers.EmailField()
    contact_title = serializers.CharField(max_length=20, required=False, allow_blank=True)
    professional_registration = serializers.CharField(max_length=50, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    practice_name = serializers.CharField(max_length=255)
    address_line_1 = serializers.CharField(max_length=255)
    address_line_2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100)
    postcode = serializers.CharField(max_length=10)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    practice_email = serializers.EmailField(required=False, allow_blank=True)
    chain_name = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['registration_type'] == 'chain' and not attrs.get('chain_name'):
            raise serializers.ValidationError({'chain_name': 'Required when registering a group / chain.'})
        return attrs

    def create(self, validated_data):
        validated_data['password'] = make_password(validated_data['password'])
        return OnboardingRegistration.objects.create(**validated_data)
