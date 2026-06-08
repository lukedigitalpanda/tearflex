from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .serializers import MeSerializer, PracticeSerializer, ClinicianSerializer, ClinicianInviteSerializer
from .permissions import IsPracticeAdmin


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
            },
            'clinician': ClinicianSerializer(clinician).data,
        })


class PracticeView(generics.RetrieveUpdateAPIView):
    """Get or update the current user's practice."""
    serializer_class = PracticeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user.clinician.practice


class PracticeClinicianListView(generics.ListAPIView):
    """List clinicians in the current practice."""
    serializer_class = ClinicianSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.request.user.clinician.practice.clinicians.select_related('user').all()


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
