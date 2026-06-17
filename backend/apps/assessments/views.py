from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from apps.accounts.scoping import accessible_practice_ids, scope_queryset
from .models import Assessment, TestCapture, TestResult
from .serializers import (
    AssessmentSerializer, AssessmentListSerializer,
    TestCaptureSerializer, TestCaptureUploadSerializer,
    ManualCaptureSerializer,
)
from .tasks import process_capture


def _require_assessment_access(user, assessment):
    """Raise PermissionDenied unless the user may access this assessment's practice."""
    allowed = accessible_practice_ids(user)
    if allowed is not None and assessment.patient.practice_id not in allowed:
        raise PermissionDenied()


class PracticeScopedMixin:
    """Scope queryset to the practices the user may access (own practice, their
    chain, or all for superusers); ?practice_id=X honoured only if within it."""
    def get_queryset(self):
        return scope_queryset(
            super().get_queryset(), self.request.user, 'patient__practice',
            self.request.query_params.get('practice_id'),
        )


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
        _require_assessment_access(self.request.user, serializer.validated_data['assessment'])
        capture = serializer.save()
        task = process_capture.delay(capture.id)
        capture.celery_task_id = task.id
        capture.status = 'processing'
        capture.save()


class CaptureDetailView(generics.RetrieveAPIView):
    serializer_class = TestCaptureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return scope_queryset(
            TestCapture.objects.all(), self.request.user, 'assessment__patient__practice',
        )


class ManualCaptureCreateView(generics.GenericAPIView):
    serializer_class = ManualCaptureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        data = serializer.validated_data
        assessment = data['assessment']

        _require_assessment_access(user, assessment)
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
    qs = scope_queryset(TestCapture.objects.all(), request.user, 'assessment__patient__practice')
    try:
        capture = qs.get(pk=pk)
    except TestCapture.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    data = {'id': capture.id, 'status': capture.status}
    if capture.status == 'analysed' and hasattr(capture, 'result'):
        from .serializers import TestResultSerializer
        data['result'] = TestResultSerializer(capture.result).data
    return Response(data)
