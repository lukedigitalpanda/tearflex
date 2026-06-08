from django.contrib import admin

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'assessment', 'status', 'created_at']
    list_filter = ['status']
    readonly_fields = ['created_at']
