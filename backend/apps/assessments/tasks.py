import time
import logging
from celery import shared_task
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def process_capture(self, capture_id):
    """Process a video capture through the analysis pipeline."""
    from .models import TestCapture, TestResult
    from apps.analysis.pipeline import analyse_capture

    try:
        capture = TestCapture.objects.get(pk=capture_id)
        capture.status = 'processing'
        capture.save()

        start_time = time.time()

        # Run the analysis pipeline
        result_data = analyse_capture(capture)

        processing_time = time.time() - start_time

        # Extract heatmap before model creation (not a direct model field)
        heatmap_bytes = result_data.pop('heatmap_bytes', None)

        # Save results
        result = TestResult.objects.create(
            capture=capture,
            processing_time_seconds=processing_time,
            **result_data,
        )

        if heatmap_bytes:
            result.nibut_heatmap.save(
                f'heatmap_{capture.id}.png',
                ContentFile(heatmap_bytes),
                save=True,
            )

        capture.status = 'analysed'
        capture.save()

        # Update parent assessment status if all captures are done
        assessment = capture.assessment
        if not assessment.captures.exclude(status='analysed').exists():
            assessment.status = 'complete'
            assessment.save()

        logger.info(f'Capture {capture_id} analysed in {processing_time:.1f}s')

    except Exception as exc:
        logger.error(f'Capture {capture_id} analysis failed: {exc}')
        try:
            capture = TestCapture.objects.get(pk=capture_id)
            capture.status = 'failed'
            capture.save()
        except TestCapture.DoesNotExist:
            pass
        raise self.retry(exc=exc, countdown=30)
