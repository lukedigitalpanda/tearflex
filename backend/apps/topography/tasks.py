import logging

import cv2
from celery import shared_task
from django.core.files.base import ContentFile
from apps.analysis.topography.frames import select_best_frame, sharpness
from apps.analysis.topography.pipeline import analyse_topography_frame
from apps.analysis.topography.disc import default_cone_profile, CONE_NOMINAL_WORKING_DISTANCE_MM
from .models import TopographyScan, TopographyResult

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def process_topography_scan(self, scan_id: int) -> None:
    try:
        scan = TopographyScan.objects.get(id=scan_id)
        scan.status = 'processing'
        scan.save(update_fields=['status', 'updated_at'])

        # Clear any stale selection from a prior run so the loop below can set
        # exactly the winner. An unreadable still (excluded from `valid`) is
        # reset here and stays False; a readable one gets reset then re-set.
        scan.stills.update(is_selected=False)
        stills = list(scan.stills.all())
        images = [cv2.imread(s.image.path) for s in stills]
        valid = [(s, im) for s, im in zip(stills, images) if im is not None]
        if not valid:
            raise ValueError(f"No readable stills for scan {scan_id}")

        valid_imgs = [im for _, im in valid]
        best_local = select_best_frame(valid_imgs)
        best_still = valid[best_local][0]
        best_image = valid_imgs[best_local]

        for s, im in valid:
            s.sharpness_score = sharpness(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
            s.is_selected = (s.id == best_still.id)
            s.save(update_fields=['sharpness_score', 'is_selected'])

        if scan.camera_focal_px:
            radii_mm, depths_mm = default_cone_profile()
            out = analyse_topography_frame(
                best_image,
                distance_mm=CONE_NOMINAL_WORKING_DISTANCE_MM,
                focal_px=scan.camera_focal_px,
                ring_object_radii_mm=radii_mm,
                ring_object_depths_mm=depths_mm,
                calibration_state='default',
            )
        else:
            out = analyse_topography_frame(best_image)

        # Badge the result with what the reconstruction actually did, not the scan's
        # input state — the label must never claim more than the maths delivered.
        result_state = out['raw_output']['calibration_state']
        result = TopographyResult(
            scan=scan,
            sim_k_flat=out['sim_k_flat'],
            sim_k_steep=out['sim_k_steep'],
            sim_k_axis=out['sim_k_axis'],
            central_k=out['central_k'],
            astigmatism_magnitude=out['astigmatism_magnitude'],
            astigmatism_axis=out['astigmatism_axis'],
            confidence=out['confidence'],
            algorithm_version=out['algorithm_version'],
            calibration_state=result_state,
            raw_output=out['raw_output'],
        )
        result.ring_overlay.save(f'overlay_{scan_id}.png',
                                 ContentFile(out['ring_overlay_png']), save=False)
        result.axial_map.save(f'axial_{scan_id}.png',
                              ContentFile(out['axial_map_png']), save=False)
        result.save()

        scan.status = 'analysed'
        scan.calibration_state = result_state
        scan.save(update_fields=['status', 'calibration_state', 'updated_at'])
        logger.info(f'Scan {scan_id} analysed successfully')

    except Exception as exc:
        logger.error(f'Scan {scan_id} analysis failed: {exc}')
        try:
            scan = TopographyScan.objects.get(id=scan_id)
            scan.status = 'failed'
            scan.save(update_fields=['status', 'updated_at'])
        except TopographyScan.DoesNotExist:
            pass
        raise self.retry(exc=exc, countdown=30)
