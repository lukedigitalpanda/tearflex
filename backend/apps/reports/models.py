from django.db import models


class Report(models.Model):
    """A generated PDF report for an assessment."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]

    # Hard ceiling on generation attempts. Once reached the report stays
    # 'failed' and is no longer retried automatically (a privileged user can
    # still force a manual retry, which resets the counter).
    MAX_GENERATION_ATTEMPTS = 3

    # One report per assessment: regenerating reuses this row, so failed/stale
    # attempts never pile up. Re-running a test creates a new Assessment, which
    # therefore gets its own report.
    assessment = models.OneToOneField(
        'assessments.Assessment', on_delete=models.CASCADE, related_name='report'
    )
    generated_by = models.ForeignKey(
        'accounts.Clinician', on_delete=models.SET_NULL, null=True, blank=True
    )
    pdf_file = models.FileField(upload_to='reports/%Y/%m/%d/', blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    generation_attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Report #{self.pk} for assessment {self.assessment_id}'
