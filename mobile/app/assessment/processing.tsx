import { useEffect } from 'react';
import {
  View, Text, TouchableOpacity, BackHandler, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCaptureStatus } from '@/hooks/useCaptures';

export default function ProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { captureId, testType } = useLocalSearchParams<{ assessmentId: string; captureId: string; testType: string }>();
  const id = captureId ? Number(captureId) : null;
  const { data, isTimedOut } = useCaptureStatus(id);
  const status = data?.status;

  // Block Android back while still processing
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => status !== 'analysed' && status !== 'failed' && !isTimedOut);
    return () => sub.remove();
  }, [status, isTimedOut]);

  useEffect(() => {
    if (status === 'analysed' && id !== null) {
      router.replace({ pathname: '/assessment/results', params: { captureId: String(id), testType: testType ?? '' } });
    }
  }, [status, id, router, testType]);

  const isError = status === 'failed' || isTimedOut;

  if (isError) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.errorIcon}><Text style={styles.errorIconText}>✕</Text></View>
          <Text style={styles.title}>{isTimedOut ? 'Still processing' : 'Analysis failed'}</Text>
          <Text style={styles.subtitle}>
            {isTimedOut ? 'This is taking longer than expected.' : 'Something went wrong.'} Please try again.
          </Text>
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
        <Text style={styles.title}>Analysing tear film...</Text>
        <Text style={styles.subtitle}>Running analysis...</Text>
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
