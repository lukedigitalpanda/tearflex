from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', views.RegisterView.as_view(), name='register'),
    path('me/', views.MeView.as_view(), name='me'),
    path('practices/', views.PracticeListView.as_view(), name='practice-list'),
    path('practice/', views.PracticeView.as_view(), name='practice'),
    path('practice/clinicians/', views.PracticeClinicianListView.as_view(), name='practice-clinicians'),
    path('practice/clinicians/invite/', views.ClinicianInviteView.as_view(), name='clinician-invite'),
]
