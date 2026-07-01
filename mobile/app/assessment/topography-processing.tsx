import { useEffect } from 'react';
import { View, Text, TouchableOpacity, BackHandler, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTopographyUpload, type TopographyPhase } from '@/hooks/useTopographyUpload';
import { api, AuthExpiredError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type ScanStatusResponse = { status: string };

function parseStillUris(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export default function TopographyProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assessmentId, videoUri, stillUris } = useLocalSearchParams<{
    assessmentId: string;
    videoUri: string;
    stillUris: string;
  }>();

  const { phase, scanId, error, upload } = useTopographyUpload();

  useEffect(() => {
    if (!assessmentId) { router.replace('/(tabs)/'); return; }
    const stills = parseStillUris(stillUris);
    if (stills.length === 0 && !videoUri) { router.replace('/(tabs)/'); return; }
    upload({ assessmentId: Number(assessmentId), videoUri: videoUri ?? null, stillUris: stills })
      .catch((e: unknown) => {
        if (e instanceof AuthExpiredError) useAuthStore.getState().clear();
      });
  }, [assessmentId, videoUri, stillUris, upload, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      phase === 'uploading' || phase === 'polling');
    return () => sub.remove();
  }, [phase]);

  const { data: statusData } = useQuery<ScanStatusResponse>({
    queryKey: ['topography-scan-status', scanId],
    queryFn: () => {
      if (scanId === null) throw new Error('scanId is null');
      return api.get<ScanStatusResponse>(`topography/scans/${scanId}/status/`);
    },
    enabled: phase === 'polling' && scanId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === 'analysed' || s === 'failed') return false;
      return 2000;
    },
  });

  useEffect(() => {
    if (statusData?.status === 'analysed' && scanId !== null) {
      router.replace({
        pathname: '/assessment/topography-results',
        params: { scanId: String(scanId) },
      });
    }
  }, [statusData?.status, scanId, router]);

  const isError = phase === 'error' || statusData?.status === 'failed';

  const phaseSubtitles: Record<TopographyPhase, string> = {
    idle: 'Preparing…',
    uploading: 'Uploading scan…',
    polling: 'Reconstructing corneal shape…',
    done: 'Done',
    error: '',
  };

  if (isError) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.errorIcon}><Text style={styles.errorIconText}>✕</Text></View>
          <Text style={styles.title}>Reconstruction failed</Text>
          <Text style={styles.subtitle}>{error ?? 'Something went wrong. Please try again.'}</Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity style={styles.retryButton} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => router.replace('/(tabs)/')} activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color="#0E7C7B" />
        <Text style={styles.title}>Analysing corneal shape…</Text>
        <Text style={styles.subtitle}>{phaseSubtitles[phase]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  subtitle: { color: '#94A3B8', fontSize: 14, textAlign: 'center' },
  errorIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F87171', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  errorIconText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  buttonGroup: { alignSelf: 'stretch', gap: 12, marginTop: 16 },
  retryButton: { backgroundColor: '#0E7C7B', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  retryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  cancelButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  cancelButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
});
