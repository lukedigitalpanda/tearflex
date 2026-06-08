from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Patient
from .serializers import PatientSerializer, PatientListSerializer


class PracticeScopedMixin:
    """Ensure queryset is scoped to the current user's practice."""
    def get_queryset(self):
        return super().get_queryset().filter(practice=self.request.user.clinician.practice)

    def perform_create(self, serializer):
        serializer.save(practice=self.request.user.clinician.practice)


class PatientListCreateView(PracticeScopedMixin, generics.ListCreateAPIView):
    queryset = Patient.objects.all()
    search_fields = ['first_name', 'last_name', 'nhs_number', 'email']
    ordering_fields = ['last_name', 'updated_at', 'created_at']
    filterset_fields = ['is_active']

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return PatientListSerializer
        return PatientSerializer


class PatientDetailView(PracticeScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer

    def perform_destroy(self, instance):
        """Soft delete."""
        instance.is_active = False
        instance.save()


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def patient_trend(request, pk):
    """Return NIBUT trend data for a patient's assessment history."""
    practice = request.user.clinician.practice
    try:
        patient = Patient.objects.get(pk=pk, practice=practice)
    except Patient.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    from apps.assessments.models import TestResult
    results = TestResult.objects.filter(
        capture__assessment__patient=patient,
        capture__test_type='nibut',
        nibut_first_breakup_seconds__isnull=False,
    ).order_by('analysed_at').values(
        'analysed_at', 'nibut_first_breakup_seconds', 'nibut_mean_breakup_seconds', 'dry_eye_severity'
    )

    data = [
        {
            'date': r['analysed_at'].strftime('%d/%m/%Y') if r['analysed_at'] else '',
            'nibut': r['nibut_first_breakup_seconds'],
        }
        for r in results
    ]
    return Response(data)
