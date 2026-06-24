from django.db import models


class TopographyScan(models.Model):
    """A corneal topography capture within an assessment session."""
    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('processing', 'Processing'),
        ('analysed', 'Analysed'),
        ('failed', 'Failed'),
    ]
    CALIBRATION_STATE_CHOICES = [
        ('uncalibrated', 'Uncalibrated'),
        ('default', 'Default profile'),
        ('calibrated', 'Calibrated'),
    ]

    assessment = models.ForeignKey('assessments.Assessment', on_delete=models.CASCADE,
                                   related_name='topography_scans')
    video_file = models.FileField(upload_to='topography/video/%Y/%m/%d/', blank=True, null=True)
    device_model = models.CharField(max_length=100, blank=True)
    phone_model_id = models.CharField(max_length=100, blank=True)
    app_version = models.CharField(max_length=20, blank=True)
    calibration_state = models.CharField(max_length=20, choices=CALIBRATION_STATE_CHOICES,
                                         default='uncalibrated')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    celery_task_id = models.CharField(max_length=255, blank=True)
    captured_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-captured_at']

    def __str__(self):
        return f'Topography scan {self.pk} ({self.status})'


class TopographyStill(models.Model):
    """One frame from the high-res still burst for a scan."""
    scan = models.ForeignKey(TopographyScan, on_delete=models.CASCADE, related_name='stills')
    image = models.ImageField(upload_to='topography/stills/%Y/%m/%d/')
    index = models.IntegerField()
    sharpness_score = models.FloatField(null=True, blank=True)
    is_selected = models.BooleanField(default=False)

    class Meta:
        ordering = ['index']


class TopographyResult(models.Model):
    """Reconstruction output for a scan."""
    scan = models.OneToOneField(TopographyScan, on_delete=models.CASCADE, related_name='result')

    ring_overlay = models.ImageField(upload_to='topography/overlays/%Y/%m/%d/', blank=True)
    axial_map = models.ImageField(upload_to='topography/axial/%Y/%m/%d/', blank=True)

    sim_k_flat = models.FloatField(null=True, blank=True)
    sim_k_steep = models.FloatField(null=True, blank=True)
    sim_k_axis = models.FloatField(null=True, blank=True)
    central_k = models.FloatField(null=True, blank=True)
    astigmatism_magnitude = models.FloatField(null=True, blank=True)
    astigmatism_axis = models.FloatField(null=True, blank=True)

    confidence = models.FloatField(null=True, blank=True)
    algorithm_version = models.CharField(max_length=20, blank=True)
    calibration_state = models.CharField(max_length=20, blank=True)
    raw_output = models.JSONField(default=dict, blank=True)
    analysed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Result for scan {self.scan_id}'
