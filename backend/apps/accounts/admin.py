from django.contrib import admin
from .models import Chain, Practice, Clinician


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
