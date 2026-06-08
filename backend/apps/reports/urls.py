from django.urls import path

from . import views

urlpatterns = [
    path('', views.ReportListView.as_view(), name='report-list'),
    path('generate/', views.GenerateReportView.as_view(), name='report-generate'),
    path('<int:pk>/download/', views.DownloadReportView.as_view(), name='report-download'),
]
