from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .models import Assessment, TestCapture, TestResult
from .serializers import (
    AssessmentSerializer, AssessmentListSerializer,
    TestCaptureSerializer, TestCaptureUploadSerializer,
    ManualCaptureSerializer,
)
from .tasks import process_capture


class PracticeScopedMixin:
    """Scope queryset to the user's practice; superusers see all practices.
    Superusers may pass ?practice_id=X to filter to a specific practice."""
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_superuser:
            practice_id = self.request.query_params.get('practice_id')
            if practice_id:
                return qs.filter(patient__practice_id=practice_id)
            return qs
        return qs.filter(patient__practice=self.request.user.clinician.practice)


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
        user = self.request.user
        if not user.is_superuser:
            try:
                practice = user.clinician.practice
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
        if self.request.user.is_superuser:
            return TestCapture.objects.all()
        try:
            practice = self.request.user.clinician.practice
        except (AttributeError, ObjectDoesNotExist):
            raise PermissionDenied()
        return TestCapture.objects.filter(assessment__patient__practice=practice)


class ManualCaptureCreateView(generics.GenericAPIView):
    serializer_class = ManualCaptureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        data = serializer.validated_data
        assessment = data['assessment']

        if not user.is_superuser:
            try:
                practice = user.clinician.practice
            except (AttributeError, ObjectDoesNotExist):
                raise PermissionDenied()
            if assessment.patient.practice_id != practice.id:
                raise PermissionDenied()
        else:
            practice = assessment.patient.practice

        with transaction.atomic():
            capture = TestCapture.objects.create(
                assessment=assessment,
                test_type=data['test_type'],
                source='manual',
                status='analysed',
            )

            nibut = data.get('nibut_first_breakup_seconds')
            dry_eye_severity = None
            if nibut is not None:
                normal = practice.nibut_normal_threshold
                borderline = practice.nibut_borderline_threshold
                if nibut >= normal:
                    dry_eye_severity = 'normal'
                elif nibut >= borderline:
                    dry_eye_severity = 'mild'
                else:
                    dry_eye_severity = 'moderate'

            TestResult.objects.create(
                capture=capture,
                nibut_first_breakup_seconds=nibut,
                nibut_mean_breakup_seconds=data.get('nibut_mean_breakup_seconds'),
                fluorescein_grade=data.get('fluorescein_grade'),
                fluorescein_breakup_seconds=data.get('fluorescein_breakup_seconds'),
                lipid_grade=data.get('lipid_grade'),
                lipid_thickness_nm=data.get('lipid_thickness_nm'),
                tear_meniscus_height_mm=data.get('tear_meniscus_height_mm'),
                dry_eye_severity=dry_eye_severity,
            )

        capture_with_result = TestCapture.objects.select_related('result').get(pk=capture.pk)
        return Response(TestCaptureSerializer(capture_with_result).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def capture_status(request, pk):
    """Poll the analysis status of a capture."""
    qs = TestCapture.objects.all() if request.user.is_superuser else TestCapture.objects.filter(assessment__patient__practice=request.user.clinician.practice)
    try:
        capture = qs.get(pk=pk)
    except TestCapture.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    data = {'id': capture.id, 'status': capture.status}
    if capture.status == 'analysed' and hasattr(capture, 'result'):
        from .serializers import TestResultSerializer
        data['result'] = TestResultSerializer(capture.result).data
    return Response(data)
