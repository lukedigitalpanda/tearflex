from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', views.RegisterView.as_view(), name='register'),
    path('onboarding/', views.OnboardingSubmitView.as_view(), name='onboarding-submit'),
    path('onboarding/verify/', views.OnboardingVerifyView.as_view(), name='onboarding-verify'),
    path('me/', views.MeView.as_view(), name='me'),
    path('practices/', views.PracticeListView.as_view(), name='practice-list'),
    path('practice/', views.PracticeView.as_view(), name='practice'),
    path('practice/clinicians/', views.PracticeClinicianListView.as_view(), name='practice-clinicians'),
    path('practice/clinicians/invite/', views.ClinicianInviteView.as_view(), name='clinician-invite'),
    path('clinicians/<int:pk>/', views.ClinicianDetailView.as_view(), name='clinician-detail'),
    path('clinicians/<int:pk>/reset-password/', views.ClinicianResetPasswordView.as_view(), name='clinician-reset-password'),
    path('password-reset/', views.PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('password/change/', views.ChangePasswordView.as_view(), name='password-change'),
]
