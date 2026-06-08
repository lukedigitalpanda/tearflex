from django.db import models
from django.conf import settings


class Practice(models.Model):
    """A clinic or optician practice."""
    name = models.CharField(max_length=255)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    postcode = models.CharField(max_length=10)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    # Clinical thresholds (overridable per practice)
    nibut_normal_threshold = models.FloatField(default=10.0)
    nibut_borderline_threshold = models.FloatField(default=5.0)

    class Meta:
        verbose_name_plural = 'practices'

    def __str__(self):
        return self.name


class Clinician(models.Model):
    """A clinician user linked to a practice."""
    ROLE_CHOICES = [
        ('admin', 'Practice Admin'),
        ('clinician', 'Clinician'),
        ('technician', 'Technician'),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='clinician')
    practice = models.ForeignKey(Practice, on_delete=models.CASCADE, related_name='clinicians')
    title = models.CharField(max_length=20, blank=True)
    professional_registration = models.CharField(max_length=50, blank=True, help_text='GOC number etc.')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='clinician')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.title} {self.user.get_full_name()}'.strip()
