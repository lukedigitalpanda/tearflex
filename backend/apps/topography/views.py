from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from apps.accounts.scoping import accessible_practice_ids, scope_queryset
from .models import TopographyScan, TopographyStill
from .serializers import (
    TopographyScanSerializer, TopographyScanCreateSerializer, TopographyResultSerializer,
)
from .tasks import process_topography_scan


def _require_assessment_access(user, assessment):
    allowed = accessible_practice_ids(user)
    if allowed is not None and assessment.patient.practice_id not in allowed:
        raise PermissionDenied()


class TopographyScanCreateView(generics.CreateAPIView):
    serializer_class = TopographyScanCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        stills = data.pop('stills', [])
        _require_assessment_access(request.user, data['assessment'])

        scan = TopographyScan.objects.create(**data)
        for i, img in enumerate(stills):
            TopographyStill.objects.create(scan=scan, image=img, index=i)

        task = process_topography_scan.delay(scan.id)
        scan.celery_task_id = task.id
        scan.status = 'processing'
        scan.save(update_fields=['celery_task_id', 'status', 'updated_at'])
        return Response(TopographyScanSerializer(scan).data, status=status.HTTP_201_CREATED)


class TopographyScanDetailView(generics.RetrieveAPIView):
    serializer_class = TopographyScanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return scope_queryset(
            TopographyScan.objects.select_related('result').prefetch_related('stills'),
            self.request.user, 'assessment__patient__practice',
        )


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def topography_scan_status(request, pk):
    qs = scope_queryset(TopographyScan.objects.all(), request.user, 'assessment__patient__practice')
    try:
        scan = qs.get(pk=pk)
    except TopographyScan.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    data = {'id': scan.id, 'status': scan.status}
    if scan.status == 'analysed' and hasattr(scan, 'result'):
        data['result'] = TopographyResultSerializer(scan.result).data
    return Response(data)
