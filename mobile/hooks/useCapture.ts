import { useState } from 'react';
import * as Device from 'expo-device';
import { api } from '@/lib/api';
import type { TestType } from '@shared/types/assessment';

export type CapturePhase = 'idle' | 'uploading' | 'polling' | 'error';

export function useCapture() {
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [captureId, setCaptureId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(params: {
    assessmentId: number;
    testType: TestType;
    videoUri: string;
  }) {
    setPhase('uploading');
    setError(null);
    try {
      const result = await api.postMultipart<{ id: number; status: string }>(
        'assessments/captures/',
        {
          assessment: String(params.assessmentId),
          test_type: params.testType,
          device_model: Device.modelName ?? '',
        },
        { uri: params.videoUri, name: 'capture.mp4', type: 'video/mp4' },
      );
      setCaptureId(result.id);
      setPhase('polling');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Check your connection.');
      setPhase('error');
    }
  }

  function reset() {
    setPhase('idle');
    setCaptureId(null);
    setError(null);
  }

  return { phase, captureId, error, upload, reset };
}
