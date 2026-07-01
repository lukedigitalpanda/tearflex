import { useState, useCallback } from 'react';
import * as Device from 'expo-device';
import { api, AuthExpiredError } from '@/lib/api';

export type TopographyPhase = 'idle' | 'uploading' | 'polling' | 'done' | 'error';

export function useTopographyUpload() {
  const [phase, setPhase] = useState<TopographyPhase>('idle');
  const [scanId, setScanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async function upload(params: {
    assessmentId: number;
    videoUri: string | null;
    stillUris: string[];
  }) {
    setPhase('uploading');
    setError(null);
    try {
      const result = await api.postTopographyScan<{ id: number; status: string }>(
        {
          assessment: String(params.assessmentId),
          device_model: Device.modelName ?? '',
          phone_model_id: Device.modelId ?? '',
        },
        params.videoUri ? { uri: params.videoUri, name: 'topography.mp4', type: 'video/mp4' } : null,
        params.stillUris.map((uri, i) => ({ uri, name: `still_${i}.jpg`, type: 'image/jpeg' })),
      );
      setScanId(result.id);
      setPhase('polling');
    } catch (e) {
      if (e instanceof AuthExpiredError) throw e;
      setError(e instanceof Error ? e.message : 'Upload failed. Check your connection.');
      setPhase('error');
    }
  }, []);

  return { phase, scanId, error, upload };
}
