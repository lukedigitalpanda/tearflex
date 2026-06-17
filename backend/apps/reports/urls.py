from django.urls import path

from . import views

urlpatterns = [
    path('', views.ReportListView.as_view(), name='report-list'),
    path('generate/', views.GenerateReportView.as_view(), name='report-generate'),
    path('<int:pk>/retry/', views.RetryReportView.as_view(), name='report-retry'),
    path('<int:pk>/download/', views.DownloadReportView.as_view(), name='report-download'),
    path('<int:pk>/', views.DeleteReportView.as_view(), name='report-delete'),
]
