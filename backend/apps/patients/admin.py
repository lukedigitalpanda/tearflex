from django.contrib import admin
from .models import Patient

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ['last_name', 'first_name', 'date_of_birth', 'practice', 'is_active']
    search_fields = ['first_name', 'last_name', 'nhs_number']
    list_filter = ['practice', 'is_active']
