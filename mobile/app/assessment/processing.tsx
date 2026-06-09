import { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, BackHandler, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '@/hooks/useCapture';
import { api, AuthExpiredError } from '@/lib/api';
import type { TestType } from '@shared/types/assessment';

type CaptureStatusResponse = { status: string };

const TEST_TYPES: ReadonlySet<TestType> = new Set(['nibut', 'fluorescein', 'lipid']);

function isTestType(value: string): value is TestType {
  return TEST_TYPES.has(value as TestType);
}

export default function ProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assessmentId, testType, videoUri } = useLocalSearchParams<{
    assessmentId: string;
    testType: string;
    videoUri: string;
  }>();

  const { phase, captureId, error, upload } = useCapture();
  const uploadCalledRef = useRef(false);

  // Guard — redirect if required params are missing
  useEffect(() => {
    if (!assessmentId || !videoUri) {
      router.replace('/(tabs)/');
    }
  }, [assessmentId, videoUri, router]);

  // Upload once on mount
  useEffect(() => {
    if (uploadCalledRef.current) return;
    if (!assessmentId || !videoUri) return;
    if (!testType || !isTestType(testType)) {
      router.replace('/(tabs)/');
      return;
    }

    uploadCalledRef.current = true;
    const resolvedTestType: TestType = testType;

    upload({
      assessmentId: Number(assessmentId),
      testType: resolvedTestType,
      videoUri,
    }).catch((e: unknown) => {
      if (e instanceof AuthExpiredError) {
        // Root layout QueryCache handler clears auth — propagate by re-throwing
        // but since this is async/void context, just let it bubble to the
        // unhandled rejection handler which triggers auth reset in the app.
        throw e;
      }
      // Other errors are handled inside the hook (sets phase to 'error')
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Block Android hardware back during upload/polling
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'uploading' || phase === 'polling') {
        return true; // block back
      }
      return false;
    });
    return () => sub.remove();
  }, [phase]);

  // Poll capture status once upload is done (phase === 'polling' and captureId is set)
  const { data: statusData } = useQuery<CaptureStatusResponse>({
    queryKey: ['capture-status', captureId],
    queryFn: () => api.get<CaptureStatusResponse>(`assessments/captures/${captureId}/status/`),
    enabled: phase === 'polling' && captureId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === 'analysed' || s === 'failed') return false;
      return 2000;
    },
  });

  // Navigate to results when analysis is complete
  useEffect(() => {
    if (statusData?.status === 'analysed' && captureId !== null) {
      router.replace({
        pathname: '/assessment/results',
        params: {
          captureId: String(captureId),
          testType: testType ?? '',
        },
      });
    }
  }, [statusData?.status, captureId, router, testType]);

  const isError = phase === 'error' || statusData?.status === 'failed';

  const subtitle: string = (() => {
    if (phase === 'uploading') return 'Uploading video...';
    return 'Processing...';
  })();

  if (isError) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.errorIcon}>
            <Text style={styles.errorIconText}>✕</Text>
          </View>
          <Text style={styles.title}>Analysis failed</Text>
          <Text style={styles.subtitle}>
            {error ?? 'Something went wrong. Please try again.'}
          </Text>
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => router.replace('/(tabs)/')}
              activeOpacity={0.8}
            >
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
        <Text style={styles.title}>Analysing tear film...</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F87171',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  errorIconText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  buttonGroup: {
    alignSelf: 'stretch',
    gap: 12,
    marginTop: 16,
  },
  retryButton: {
    backgroundColor: '#0E7C7B',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
