from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Practice, Clinician
from .serializers import MeSerializer, PracticeSerializer, ClinicianSerializer, ClinicianInviteSerializer, ClinicianRegisterSerializer
from .permissions import IsPracticeAdmin


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


class PracticeListView(generics.ListAPIView):
    """List all practices — superadmin only. Pagination disabled (dropdown use)."""
    serializer_class = PracticeSerializer
    permission_classes = [permissions.IsAdminUser]
    pagination_class = None

    def get_queryset(self):
        return Practice.objects.filter(is_active=True).order_by('name')


class PracticeView(generics.RetrieveUpdateAPIView):
    """Get or update the current user's practice. Superusers may pass ?practice_id=X."""
    serializer_class = PracticeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        if self.request.user.is_superuser:
            practice_id = self.request.query_params.get('practice_id')
            if practice_id:
                return get_object_or_404(Practice, pk=practice_id)
        return self.request.user.clinician.practice


class PracticeClinicianListView(generics.ListAPIView):
    """List clinicians in the current practice, excluding superusers.
    Superusers may pass ?practice_id=X to filter to a specific practice."""
    serializer_class = ClinicianSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        base = Clinician.objects.select_related('user', 'practice').filter(user__is_superuser=False)
        if self.request.user.is_superuser:
            practice_id = self.request.query_params.get('practice_id')
            if practice_id:
                return base.filter(practice_id=practice_id)
            return base
        return base.filter(practice=self.request.user.clinician.practice)


class ClinicianInviteView(generics.GenericAPIView):
    """Invite a new clinician to the current practice (admin only)."""
    permission_classes = [permissions.IsAuthenticated, IsPracticeAdmin]
    serializer_class = ClinicianInviteSerializer

    def post(self, request):
        clinician = request.user.clinician
        serializer = self.get_serializer(
            data=request.data,
            context={'practice': clinician.practice, 'invited_by': clinician},
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        return Response(
            {
                'id': invite.id,
                'email': invite.email,
                'role': invite.role,
                'token': invite.token,
                'invite_url': f"/register?token={invite.token}",
            },
            status=status.HTTP_201_CREATED,
        )
