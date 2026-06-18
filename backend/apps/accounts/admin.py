from django.contrib import admin, messages
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from .models import Chain, Practice, Clinician, OnboardingRegistration
from .onboarding import provision_registration, OnboardingError


@admin.register(Chain)
class ChainAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'created_at']
    search_fields = ['name']


@admin.register(Practice)
class PracticeAdmin(admin.ModelAdmin):
    list_display = ['name', 'chain', 'city', 'postcode', 'is_active']
    list_filter = ['chain', 'is_active']
    list_editable = ['chain']  # assign practices to a chain inline
    search_fields = ['name', 'postcode']


@admin.register(Clinician)
class ClinicianAdmin(admin.ModelAdmin):
    list_display = ['user', 'practice', 'role', 'professional_registration']
    list_filter = ['role', 'practice']


@admin.register(OnboardingRegistration)
class OnboardingRegistrationAdmin(admin.ModelAdmin):
    list_display = ['contact_email', 'registration_type', 'practice_name', 'chain_name', 'status', 'created_at']
    list_filter = ['status', 'registration_type']
    search_fields = ['contact_email', 'practice_name', 'chain_name']
    actions = ['approve', 'reject']

    @admin.action(description='Approve selected (provision the account)')
    def approve(self, request, queryset):
        done = 0
        for reg in queryset.filter(status='awaiting_approval'):
            try:
                provision_registration(reg, decided_by=request.user)
            except OnboardingError as exc:
                self.message_user(request, f'{reg.contact_email}: {exc}', level=messages.ERROR)
                continue
            send_mail(
                subject='Your TearFlex account is ready',
                message=(
                    f"Your TearFlex application has been approved.\n\n"
                    f"Sign in here: {settings.FRONTEND_URL}/login"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[reg.contact_email],
                fail_silently=True,
            )
            done += 1
        self.message_user(request, f'Provisioned {done} account(s).')

    @admin.action(description='Reject selected')
    def reject(self, request, queryset):
        updated = queryset.filter(status='awaiting_approval').update(
            status='rejected', decided_at=timezone.now(), decided_by=request.user)
        self.message_user(request, f'Rejected {updated} registration(s).')
