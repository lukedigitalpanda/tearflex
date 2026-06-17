import secrets
from datetime import timedelta

from django.db import models
from django.conf import settings
from django.utils import timezone


class Chain(models.Model):
    """A group/brand of practices (e.g. a multi-practice optician chain)."""
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Practice(models.Model):
    """A clinic or optician practice."""
    chain = models.ForeignKey(
        'Chain', on_delete=models.SET_NULL, null=True, blank=True, related_name='practices',
    )
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
        ('chain_admin', 'Chain Admin'),
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

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.user_id and Clinician.objects.exclude(pk=self.pk).filter(user_id=self.user_id).exists():
            raise ValidationError({'user': 'This user is already assigned to a practice. An account can only belong to one practice.'})


class ClinicianInvite(models.Model):
    """A single-use invite for a new clinician to join a practice."""
    practice = models.ForeignKey(Practice, on_delete=models.CASCADE, related_name='invites')
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=Clinician.ROLE_CHOICES, default='clinician')
    token = models.CharField(max_length=64, unique=True, blank=True)
    invited_by = models.ForeignKey(Clinician, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='sent_invites')
    clinician = models.OneToOneField(
        Clinician, on_delete=models.SET_NULL, null=True, blank=True, related_name='invite'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Invite for {self.email} → {self.practice.name}'


class PasswordResetToken(models.Model):
    """Single-use, time-limited token for password resets."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='password_reset_tokens')
    token = models.CharField(max_length=64, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    def is_valid(self):
        return self.used_at is None and timezone.now() < self.expires_at

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.pk and not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=1)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Password reset for {self.user.email}'
