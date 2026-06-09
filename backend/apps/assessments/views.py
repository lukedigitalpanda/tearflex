from django.core.exceptions import ObjectDoesNotExist
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .models import Assessment, TestCapture
from .serializers import (
    AssessmentSerializer, AssessmentListSerializer,
    TestCaptureSerializer, TestCaptureUploadSerializer,
)
from .tasks import process_capture


class PracticeScopedMixin:
    def get_queryset(self):
        practice = self.request.user.clinician.practice
        return super().get_queryset().filter(patient__practice=practice)


class AssessmentListCreateView(PracticeScopedMixin, generics.ListCreateAPIView):
    queryset = Assessment.objects.select_related('patient', 'clinician__user').all()
    filterset_fields = ['patient', 'status', 'eye']
    ordering_fields = ['assessed_at']

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return AssessmentListSerializer
        return AssessmentSerializer

    def perform_create(self, serializer):
        serializer.save(clinician=self.request.user.clinician)


class AssessmentDetailView(PracticeScopedMixin, generics.RetrieveUpdateAPIView):
    queryset = Assessment.objects.prefetch_related('captures__result').select_related('patient', 'clinician__user').all()
    serializer_class = AssessmentSerializer


class CaptureUploadView(generics.CreateAPIView):
    """Upload a video capture for analysis."""
    serializer_class = TestCaptureUploadSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        try:
            practice = self.request.user.clinician.practice
        except (AttributeError, ObjectDoesNotExist):
            raise PermissionDenied()
        assessment = serializer.validated_data['assessment']
        if assessment.patient.practice_id != practice.id:
            raise PermissionDenied()
        capture = serializer.save()
        task = process_capture.delay(capture.id)
        capture.celery_task_id = task.id
        capture.status = 'processing'
        capture.save()


class CaptureDetailView(generics.RetrieveAPIView):
    serializer_class = TestCaptureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        try:
            practice = self.request.user.clinician.practice
        except (AttributeError, ObjectDoesNotExist):
            raise PermissionDenied()
        return TestCapture.objects.filter(assessment__patient__practice=practice)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def capture_status(request, pk):
    """Poll the analysis status of a capture."""
    practice = request.user.clinician.practice
    try:
        capture = TestCapture.objects.get(pk=pk, assessment__patient__practice=practice)
    except TestCapture.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    data = {'id': capture.id, 'status': capture.status}
    if capture.status == 'analysed' and hasattr(capture, 'result'):
        from .serializers import TestResultSerializer
        data['result'] = TestResultSerializer(capture.result).data
    return Response(data)
