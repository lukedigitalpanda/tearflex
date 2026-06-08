import { DryEyeSeverity } from './patient';

export type TestType = 'nibut' | 'fluorescein' | 'lipid';
export type Eye = 'left' | 'right';
export type AssessmentStatus = 'capturing' | 'processing' | 'complete' | 'failed';
export type CaptureStatus = 'uploaded' | 'processing' | 'analysed' | 'failed';

export interface Assessment {
  id: number;
  patient: number;
  patient_name: string;
  clinician: number;
  clinician_name: string;
  eye: Eye;
  notes: string;
  status: AssessmentStatus;
  assessed_at: string;
  updated_at: string;
  captures: TestCapture[];
}

export interface TestCapture {
  id: number;
  assessment: number;
  test_type: TestType;
  video_file: string;
  thumbnail: string;
  duration_seconds: number | null;
  status: CaptureStatus;
  captured_at: string;
  result: TestResult | null;
}

export interface TestResult {
  id: number;
  nibut_first_breakup_seconds: number | null;
  nibut_mean_breakup_seconds: number | null;
  nibut_heatmap: string | null;
  fluorescein_grade: number | null;
  fluorescein_breakup_seconds: number | null;
  lipid_grade: number | null;
  lipid_thickness_nm: number | null;
  tear_meniscus_height_mm: number | null;
  dry_eye_severity: DryEyeSeverity | null;
  confidence_score: number | null;
  analysis_version: string;
  processing_time_seconds: number | null;
  analysed_at: string;
}

export interface AssessmentListItem {
  id: number;
  patient: number;
  patient_name: string;
  eye: Eye;
  status: AssessmentStatus;
  assessed_at: string;
  capture_count: number;
}
