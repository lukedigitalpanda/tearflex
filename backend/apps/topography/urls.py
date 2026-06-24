from django.urls import path
from .views import TopographyScanCreateView, TopographyScanDetailView, topography_scan_status

urlpatterns = [
    path('scans/', TopographyScanCreateView.as_view(), name='topography-scan-create'),
    path('scans/<int:pk>/', TopographyScanDetailView.as_view(), name='topography-scan-detail'),
    path('scans/<int:pk>/status/', topography_scan_status, name='topography-scan-status'),
]
