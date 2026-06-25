from django.urls import path
from . import views

urlpatterns = [
    path('', views.AssessmentListCreateView.as_view(), name='assessment-list'),
    path('<int:pk>/', views.AssessmentDetailView.as_view(), name='assessment-detail'),
    path('captures/', views.CaptureUploadView.as_view(), name='capture-upload'),
    path('captures/manual/', views.ManualCaptureCreateView.as_view(), name='manual-capture-create'),
    path('captures/<int:pk>/', views.CaptureDetailView.as_view(), name='capture-detail'),
    path('captures/<int:pk>/status/', views.capture_status, name='capture-status'),
    path('captures/<int:pk>/stills/', views.CaptureStillListCreateView.as_view(), name='capture-stills'),
]
