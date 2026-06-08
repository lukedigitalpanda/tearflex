from django.urls import path
from . import views

urlpatterns = [
    path('', views.PatientListCreateView.as_view(), name='patient-list'),
    path('<int:pk>/', views.PatientDetailView.as_view(), name='patient-detail'),
    path('<int:pk>/trend/', views.patient_trend, name='patient-trend'),
]
