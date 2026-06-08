from django.contrib import admin
from .models import Assessment, TestCapture, TestResult

@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ['patient', 'eye', 'status', 'assessed_at', 'clinician']
    list_filter = ['status', 'eye']

@admin.register(TestCapture)
class TestCaptureAdmin(admin.ModelAdmin):
    list_display = ['assessment', 'test_type', 'status', 'captured_at']
    list_filter = ['test_type', 'status']

@admin.register(TestResult)
class TestResultAdmin(admin.ModelAdmin):
    list_display = ['capture', 'dry_eye_severity', 'nibut_first_breakup_seconds', 'confidence_score']
