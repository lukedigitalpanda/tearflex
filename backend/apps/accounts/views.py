from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.conf import settings as django_settings
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.db import transaction
from django.utils import timezone
from .models import Practice, Clinician, PasswordResetToken, OnboardingRegistration
from .scoping import accessible_practice_ids, resolve_practice_scope, scope_queryset
from rest_framework.exceptions import ValidationError
from .management import can_manage, is_last_active_admin
from .email_classification import is_free_or_disposable
from .onboarding import provision_registration, OnboardingError
from .serializers import (
    MeSerializer, PracticeSerializer, PracticeCreateSerializer, ClinicianSerializer,
    ClinicianInviteSerializer, ClinicianManageSerializer, ClinicianRegisterSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer, ChangePasswordSerializer,
    OnboardingSubmitSerializer,
)
from .permissions import IsPracticeAdmin, IsChainAdminOrSuperuser


class RegisterView(generics.GenericAPIView):
    """Accept a clinician invite: set password and activate the account."""
    permission_classes = [permissions.AllowAny]
    serializer_class = ClinicianRegisterSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        clinician = serializer.save()
        refresh = RefreshToken.for_user(clinician.user)
        return Response(
            {'access': str(refresh.access_token), 'refresh': str(refresh)},
            status=status.HTTP_200_OK,
        )


class MeView(APIView):
    """Return the current authenticated user with clinician and practice context."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        clinician = getattr(request.user, 'clinician', None)
        if not clinician:
            return Response({'detail': 'No clinician profile found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email,
                'first_name': request.user.first_name,
                'last_name': request.user.last_name,
                'is_superuser': request.user.is_superuser,
            },
            'clinician': ClinicianSerializer(clinician).data,
        })


class PracticeListView(generics.ListCreateAPIView):
    """List the practices the user may switch between (all for superadmins, the
    chain's practices for chain admins; pagination disabled for dropdown use).
    POST creates a practice (chain admins → force-joined to their chain;
    superusers → no chain)."""
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PracticeCreateSerializer
        return PracticeSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsChainAdminOrSuperuser()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Practice.objects.filter(is_active=True).order_by('name')
        scope = accessible_practice_ids(self.request.user)
        if scope is None:
            return qs
        return qs.filter(id__in=scope)

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_superuser:
            serializer.save()
            return
        chain = user.clinician.practice.chain
        if chain is None:
            raise ValidationError(
                'Your practice is not part of a chain, so you cannot create practices.'
            )
        serializer.save(chain=chain)


class PracticeView(generics.RetrieveUpdateAPIView):
    """Get or update the current user's practice. Superusers may pass ?practice_id=X."""
    serializer_class = PracticeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        practice_id = self.request.query_params.get('practice_id')
        if practice_id:
            if resolve_practice_scope(self.request.user, practice_id):
                return get_object_or_404(Practice, pk=practice_id)
            raise PermissionDenied()
        return self.request.user.clinician.practice


class PracticeClinicianListView(generics.ListAPIView):
    """List clinicians in the current practice, excluding superusers.
    Superusers may pass ?practice_id=X to filter to a specific practice."""
    serializer_class = ClinicianSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        base = Clinician.objects.select_related('user', 'practice').filter(
            user__is_superuser=False, user__is_active=True)
        return scope_queryset(
            base, self.request.user, 'practice',
            self.request.query_params.get('practice_id'),
        )


class ClinicianInviteView(generics.GenericAPIView):
    """Invite a new clinician to the current practice (admin only)."""
    permission_classes = [permissions.IsAuthenticated, IsPracticeAdmin]
    serializer_class = ClinicianInviteSerializer

    def post(self, request):
        inviter = request.user.clinician
        requested = request.query_params.get('practice_id')
        if requested:
            scope = resolve_practice_scope(request.user, requested)
            if not scope:
                raise PermissionDenied()
            practice = get_object_or_404(Practice, pk=next(iter(scope)))
        else:
            practice = inviter.practice
        serializer = self.get_serializer(
            data=request.data,
            context={'practice': practice, 'invited_by': inviter, 'actor_user': request.user},
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        return Response(
            {
                'id': invite.id, 'email': invite.email, 'role': invite.role,
                'token': invite.token, 'invite_url': f"/register?token={invite.token}",
            },
            status=status.HTTP_201_CREATED,
        )


class ClinicianDetailView(generics.GenericAPIView):
    """Retrieve / edit / remove a single clinician, gated by management tier."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ClinicianManageSerializer

    def _get_target(self, pk):
        return get_object_or_404(
            Clinician.objects.select_related('user', 'practice'), pk=pk)

    def get(self, request, pk):
        target = self._get_target(pk)
        scope = accessible_practice_ids(request.user)
        if scope is not None and target.practice_id not in scope:
            raise PermissionDenied()
        return Response(ClinicianSerializer(target).data)

    def patch(self, request, pk):
        target = self._get_target(pk)
        if not can_manage(request.user, target):
            raise PermissionDenied()
        serializer = self.get_serializer(
            data=request.data,
            context={'actor_user': request.user, 'target': target},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ClinicianSerializer(target).data)

    def delete(self, request, pk):
        target = self._get_target(pk)
        if not can_manage(request.user, target):
            raise PermissionDenied()
        if is_last_active_admin(target):
            raise ValidationError(
                'This is the last admin of the practice; assign another admin first.')
        target.user.is_active = False
        target.user.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(generics.GenericAPIView):
    """Request a password reset email. Always returns 200 to prevent email enumeration."""
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetRequestSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'If an account with that email exists, a reset link has been sent.'})


class PasswordResetConfirmView(generics.GenericAPIView):
    """Confirm a password reset using a token."""
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetConfirmSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Password reset successfully.'})


class ChangePasswordView(generics.GenericAPIView):
    """Authenticated user changes their own password."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClinicianResetPasswordView(generics.GenericAPIView):
    """Admin mints a one-time password-reset link for a user they manage."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        target = get_object_or_404(Clinician.objects.select_related('user'), pk=pk)
        if not can_manage(request.user, target):
            raise PermissionDenied()
        PasswordResetToken.objects.filter(user=target.user, used_at__isnull=True).delete()
        token = PasswordResetToken.objects.create(user=target.user)
        return Response(
            {'token': token.token, 'reset_url': f"/reset-password?token={token.token}"},
            status=status.HTTP_201_CREATED,
        )


class OnboardingSubmitView(generics.GenericAPIView):
    """Public self-onboarding sign-up. Creates a pending registration and emails
    a verification link."""
    permission_classes = [permissions.AllowAny]
    serializer_class = OnboardingSubmitSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['contact_email']
        # Don't reveal whether an account already exists — generic success, no-op.
        if not User.objects.filter(email__iexact=email).exists():
            reg = serializer.save()
            verify_url = f"{django_settings.FRONTEND_URL}/verify-email?token={reg.email_token}"
            send_mail(
                subject='Verify your TearFlex account',
                message=(
                    f"Welcome to TearFlex.\n\n"
                    f"Confirm your email to continue setting up {reg.practice_name}:\n\n"
                    f"{verify_url}\n\n"
                    f"If you didn't request this, you can ignore this email."
                ),
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
        return Response(
            {'detail': 'Check your email to verify your account.'},
            status=status.HTTP_201_CREATED,
        )


class OnboardingVerifyView(generics.GenericAPIView):
    """Verify an onboarding email; auto-provision professional domains, route
    free/disposable domains to superadmin approval. Issues no JWTs."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.data.get('token', '')
        if not token:
            raise ValidationError('A verification token is required.')
        with transaction.atomic():
            try:
                reg = OnboardingRegistration.objects.select_for_update().get(email_token=token)
            except OnboardingRegistration.DoesNotExist:
                raise ValidationError('Invalid or expired verification link.')
            if reg.status == 'provisioned':
                raise ValidationError('This account has already been set up. Please sign in.')
            if reg.status == 'rejected':
                raise ValidationError('This application was not approved.')

            if reg.email_verified_at is None:
                reg.email_verified_at = timezone.now()
                reg.save(update_fields=['email_verified_at'])

            if reg.status == 'awaiting_approval' or is_free_or_disposable(reg.contact_email):
                if reg.status != 'awaiting_approval':
                    reg.status = 'awaiting_approval'
                    reg.save(update_fields=['status'])
                return Response({'status': 'awaiting_approval'})

            try:
                provision_registration(reg)
            except OnboardingError as exc:
                raise ValidationError(str(exc))
            return Response({'status': 'provisioned'})
