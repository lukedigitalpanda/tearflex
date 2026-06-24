import cv2
from celery import shared_task
from django.core.files.base import ContentFile
from apps.analysis.topography.frames import select_best_frame, sharpness
from apps.analysis.topography.pipeline import analyse_topography_frame
from .models import TopographyScan, TopographyResult


@shared_task
def process_topography_scan(scan_id: int) -> None:
    scan = TopographyScan.objects.get(id=scan_id)
    scan.status = 'processing'
    scan.save(update_fields=['status', 'updated_at'])
    try:
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

        out = analyse_topography_frame(best_image)
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
            calibration_state=scan.calibration_state,
            raw_output=out['raw_output'],
        )
        result.ring_overlay.save(f'overlay_{scan_id}.png',
                                 ContentFile(out['ring_overlay_png']), save=False)
        result.axial_map.save(f'axial_{scan_id}.png',
                              ContentFile(out['axial_map_png']), save=False)
        result.save()

        scan.status = 'analysed'
        scan.save(update_fields=['status', 'updated_at'])
    except Exception:
        scan.status = 'failed'
        scan.save(update_fields=['status', 'updated_at'])
        raise
