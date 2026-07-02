export type CalibrationState = 'uncalibrated' | 'default' | 'calibrated';
export type TopographyScanStatus = 'uploaded' | 'processing' | 'analysed' | 'failed';

export interface TopographyResult {
  id: number;
  ring_overlay: string | null;
  axial_map: string | null;
  sim_k_flat: number | null;
  sim_k_steep: number | null;
  sim_k_axis: number | null;
  central_k: number | null;
  astigmatism_magnitude: number | null;
  astigmatism_axis: number | null;
  confidence: number | null;
  algorithm_version: string;
  calibration_state: CalibrationState | '';
  analysed_at: string;
}

export interface TopographyStill {
  id: number;
  image: string;
  index: number;
  sharpness_score: number | null;
  is_selected: boolean;
}

export interface TopographyScan {
  id: number;
  assessment: number;
  video_file: string | null;
  device_model: string;
  phone_model_id: string;
  app_version: string;
  camera_focal_px: number | null;
  capture_width_px: number | null;
  capture_height_px: number | null;
  calibration_state: CalibrationState;
  status: TopographyScanStatus;
  captured_at: string;
  stills: TopographyStill[];
  result: TopographyResult | null;
}
