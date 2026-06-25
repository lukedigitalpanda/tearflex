from django.db import models


class Assessment(models.Model):
    """A tear film assessment session for a patient."""
    STATUS_CHOICES = [
        ('capturing', 'Capturing'),
        ('processing', 'Processing'),
        ('complete', 'Complete'),
        ('failed', 'Failed'),
    ]
    EYE_CHOICES = [('left', 'Left'), ('right', 'Right')]

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='assessments')
    clinician = models.ForeignKey('accounts.Clinician', on_delete=models.SET_NULL, null=True, related_name='assessments')
    eye = models.CharField(max_length=5, choices=EYE_CHOICES)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='capturing')
    assessed_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-assessed_at']

    def __str__(self):
        return f'{self.patient} - {self.eye} eye - {self.assessed_at:%d/%m/%Y}'


class TestCapture(models.Model):
    """An individual test capture within an assessment."""
    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('processing', 'Processing'),
        ('analysed', 'Analysed'),
        ('failed', 'Failed'),
    ]
    TEST_TYPE_CHOICES = [
        ('nibut', 'NIBUT'),
        ('fluorescein', 'Fluorescein Break-Up'),
        ('lipid', 'Lipid Layer'),
    ]

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name='captures')
    test_type = models.CharField(max_length=20, choices=TEST_TYPE_CHOICES)
    source = models.CharField(
        max_length=10,
        choices=[
            ('mobile', 'Mobile camera'),
            ('upload', 'Uploaded file'),
            ('manual', 'Manual entry (no video)'),
        ],
        default='mobile',
    )
    video_file = models.FileField(upload_to='captures/%Y/%m/%d/', blank=True, null=True)
    thumbnail = models.ImageField(upload_to='thumbnails/%Y/%m/%d/', blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    resolution_width = models.IntegerField(null=True, blank=True)
    resolution_height = models.IntegerField(null=True, blank=True)
    fps = models.FloatField(null=True, blank=True)
    device_model = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    captured_at = models.DateTimeField(auto_now_add=True)
    celery_task_id = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-captured_at']

    def __str__(self):
        return f'{self.get_test_type_display()} - {self.assessment}'


class TestResult(models.Model):
    """Analysis results for a test capture."""
    capture = models.OneToOneField(TestCapture, on_delete=models.CASCADE, related_name='result')

    # NIBUT results
    nibut_first_breakup_seconds = models.FloatField(null=True, blank=True)
    nibut_mean_breakup_seconds = models.FloatField(null=True, blank=True)
    nibut_heatmap = models.ImageField(upload_to='heatmaps/%Y/%m/%d/', blank=True)

    # Fluorescein results
    fluorescein_grade = models.IntegerField(null=True, blank=True)
    fluorescein_breakup_seconds = models.FloatField(null=True, blank=True)

    # Lipid layer results
    lipid_grade = models.IntegerField(null=True, blank=True)
    lipid_thickness_nm = models.FloatField(null=True, blank=True)

    # Tear meniscus
    tear_meniscus_height_mm = models.FloatField(null=True, blank=True)

    # Overall
    dry_eye_severity = models.CharField(max_length=20, choices=[
        ('normal', 'Normal'),
        ('mild', 'Mild'),
        ('moderate', 'Moderate'),
        ('severe', 'Severe'),
    ], null=True, blank=True)

    # Metadata
    confidence_score = models.FloatField(null=True, blank=True)
    analysis_version = models.CharField(max_length=20, blank=True)
    processing_time_seconds = models.FloatField(null=True, blank=True)
    analysed_at = models.DateTimeField(auto_now_add=True)
    raw_output = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f'Result for {self.capture}'
