from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Practice, Clinician
from .scoping import accessible_practice_ids, resolve_practice_scope, scope_queryset
from rest_framework.exceptions import ValidationError
from .serializers import (
    MeSerializer, PracticeSerializer, PracticeCreateSerializer, ClinicianSerializer,
    ClinicianInviteSerializer, ClinicianRegisterSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
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
        base = Clinician.objects.select_related('user', 'practice').filter(user__is_superuser=False)
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
