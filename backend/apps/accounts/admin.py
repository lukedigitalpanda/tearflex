from django.contrib import admin
from .models import Practice, Clinician

@admin.register(Practice)
class PracticeAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'postcode', 'is_active']
    search_fields = ['name', 'postcode']

@admin.register(Clinician)
class ClinicianAdmin(admin.ModelAdmin):
    list_display = ['user', 'practice', 'role', 'professional_registration']
    list_filter = ['role', 'practice']
