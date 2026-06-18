from django.db import models


class Patient(models.Model):
    """A patient record belonging to a practice."""
    SEX_CHOICES = [('M', 'Male'), ('F', 'Female'), ('O', 'Other')]

    practice = models.ForeignKey('accounts.Practice', on_delete=models.CASCADE, related_name='patients')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    sex = models.CharField(max_length=10, choices=SEX_CHOICES, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    nhs_number = models.CharField(max_length=20)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        unique_together = ['practice', 'first_name', 'last_name', 'date_of_birth']

    def __str__(self):
        return f'{self.first_name} {self.last_name}'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'

    @property
    def latest_severity(self):
        """Return the most recent dry eye severity grading."""
        from apps.assessments.models import TestResult
        result = TestResult.objects.filter(
            capture__assessment__patient=self,
            dry_eye_severity__isnull=False,
        ).order_by('-analysed_at').first()
        return result.dry_eye_severity if result else None
