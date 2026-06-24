from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from apps.accounts.scoping import accessible_practice_ids, scope_queryset
from .models import DeviceCalibration
from .serializers import DeviceCalibrationSerializer


def _caller_practice(user):
    """The practice to attach a new calibration to: the clinician's own practice."""
    clinician = getattr(user, 'clinician', None)
    if clinician is None:
        raise PermissionDenied('No practice for this user.')
    return clinician.practice


class DeviceCalibrationListCreateView(generics.ListCreateAPIView):
    serializer_class = DeviceCalibrationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = scope_queryset(DeviceCalibration.objects.all(), self.request.user, 'practice')
        phone_model_id = self.request.query_params.get('phone_model_id')
        if phone_model_id:
            qs = qs.filter(phone_model_id=phone_model_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(practice=_caller_practice(self.request.user))


class DeviceCalibrationDetailView(generics.RetrieveAPIView):
    serializer_class = DeviceCalibrationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return scope_queryset(DeviceCalibration.objects.all(), self.request.user, 'practice')
