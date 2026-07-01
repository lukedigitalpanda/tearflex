from django.urls import path
from .views import DeviceCalibrationListCreateView, DeviceCalibrationDetailView

urlpatterns = [
    path('devices/', DeviceCalibrationListCreateView.as_view(), name='calibration-device-list-create'),
    path('devices/<int:pk>/', DeviceCalibrationDetailView.as_view(), name='calibration-device-detail'),
]
