from django.db import models


class Report(models.Model):
    """A generated PDF report for an assessment."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]

    assessment = models.ForeignKey(
        'assessments.Assessment', on_delete=models.CASCADE, related_name='reports'
    )
    generated_by = models.ForeignKey(
        'accounts.Clinician', on_delete=models.SET_NULL, null=True, blank=True
    )
    pdf_file = models.FileField(upload_to='reports/%Y/%m/%d/', blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Report #{self.pk} for assessment {self.assessment_id}'
