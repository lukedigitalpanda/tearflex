from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .serializers import MeSerializer, PracticeSerializer, ClinicianSerializer


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
