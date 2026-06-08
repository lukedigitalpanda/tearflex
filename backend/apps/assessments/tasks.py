import time
import logging
from celery import shared_task

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

        # Save results
        TestResult.objects.create(
            capture=capture,
            processing_time_seconds=processing_time,
            analysis_version='1.0.0',
            **result_data,
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
