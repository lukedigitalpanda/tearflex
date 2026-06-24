from django.db import models


class DeviceCalibration(models.Model):
    """A stored calibration for one phone-model + Placido attachment combination.

    The maths-dependent payloads are JSON so the (deferred) calibration algorithm can
    evolve without a schema migration. See the subsystem-A design spec.
    """
    METHOD_CHOICES = [
        ('default_profile', 'Default profile'),     # per-model nominal (no per-unit reference)
        ('reference_object', 'Reference-object'),    # per-unit, known-size reference solve
    ]

    practice = models.ForeignKey('accounts.Practice', on_delete=models.CASCADE,
                                 related_name='device_calibrations')
    phone_model_id = models.CharField(max_length=100)            # "iphone16,2" — the calibration key
    device_model = models.CharField(max_length=100, blank=True)  # "iPhone 16 Pro"
    attachment_id = models.CharField(max_length=100, blank=True) # which Placido attachment
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='reference_object')

    camera_intrinsics = models.JSONField(default=dict, blank=True)     # focal, sensor, distortion
    attachment_geometry = models.JSONField(default=dict, blank=True)   # ring radii, disc-lens offset
    solve_result = models.JSONField(default=dict, blank=True)          # fitted system constant(s)

    calibration_version = models.CharField(max_length=20, default='calib-v0.1')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Calibration {self.pk} for {self.phone_model_id} ({self.method})'
