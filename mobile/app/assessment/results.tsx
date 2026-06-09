import { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { NIBUTResult } from '@/components/results/NIBUTResult';
import { MetricsGrid } from '@/components/results/MetricsGrid';
import type { Severity } from '@/constants/colours';
import { colours } from '@/constants/colours';

// Screen-local type — not added to shared types yet
interface CaptureResult {
  nibut_first_breakup_seconds: number | null;
  nibut_mean_breakup_seconds: number | null;
  fluorescein_grade: number | null;
  fluorescein_breakup_seconds: number | null;
  lipid_grade: number | null;
  lipid_thickness_nm: number | null;
  dry_eye_severity: Severity | null;
  confidence_score: number | null;
  analysed_at: string;
}

interface CaptureDetail {
  id: number;
  test_type: 'nibut' | 'fluorescein' | 'lipid';
  status: 'uploaded' | 'processing' | 'analysed' | 'failed';
  captured_at: string;
  result: CaptureResult | null;
}

export default function ResultsScreen() {
  const { captureId, testType } = useLocalSearchParams<{
    captureId: string;
    testType: string;
  }>();
  const router = useRouter();

  // Navigation guard — if no captureId, go home
  useEffect(() => {
    if (!captureId) {
      router.replace('/(tabs)/');
    }
  }, [captureId, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['capture', captureId],
    queryFn: () => api.get<CaptureDetail>(`assessments/captures/${captureId}/`),
    enabled: !!captureId,
    staleTime: 60_000,
  });

  const resolvedTestType = (testType ?? data?.test_type) as
    | 'nibut'
    | 'fluorescein'
    | 'lipid'
    | undefined;

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50">
        <View className="flex-1 items-center justify-center">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colours.teal600} />
            <Text style={styles.loadingText}>Loading results…</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (isError || !data) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50">
        <View className="flex-1 items-center justify-center px-6">
          <Text style={styles.errorTitle}>Could not load results</Text>
          <Text style={styles.errorSub}>
            There was a problem retrieving the analysis results.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const result = data.result;

  // Build metrics grid items depending on test type
  const metricsItems: Array<{ label: string; value: string; unit?: string }> = [];

  if (resolvedTestType === 'nibut') {
    metricsItems.push({
      label: 'Mean NIBUT',
      value: result?.nibut_mean_breakup_seconds?.toFixed(1) ?? '—',
      unit: 's',
    });
    metricsItems.push({
      label: 'Confidence',
      value: ((result?.confidence_score ?? 0) * 100).toFixed(0),
      unit: '%',
    });
  } else if (resolvedTestType === 'fluorescein') {
    metricsItems.push({
      label: 'Break-up time',
      value: result?.fluorescein_breakup_seconds?.toFixed(1) ?? '—',
      unit: 's',
    });
  } else if (resolvedTestType === 'lipid') {
    metricsItems.push({
      label: 'Est. thickness',
      value: result?.lipid_thickness_nm?.toFixed(0) ?? '—',
      unit: 'nm',
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center mb-5 pt-2">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Text className="text-teal-600 text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">Results</Text>
        </View>

        {/* Primary result card */}
        {resolvedTestType === 'nibut' ? (
          <NIBUTResult
            firstBreakup={result?.nibut_first_breakup_seconds ?? null}
            meanBreakup={result?.nibut_mean_breakup_seconds ?? null}
            severity={result?.dry_eye_severity ?? null}
          />
        ) : resolvedTestType === 'fluorescein' ? (
          <View style={styles.gradeCard}>
            <Text style={styles.gradeLabel}>Oxford Grade</Text>
            <Text style={styles.gradeValue}>
              {result?.fluorescein_grade != null ? result.fluorescein_grade : '—'}
              <Text style={styles.gradeMax}>/5</Text>
            </Text>
            <Text style={styles.gradeSubLabel}>Fluorescein staining</Text>
          </View>
        ) : (
          <View style={styles.gradeCard}>
            <Text style={styles.gradeLabel}>Guillon Grade</Text>
            <Text style={styles.gradeValue}>
              {result?.lipid_grade != null ? result.lipid_grade : '—'}
              <Text style={styles.gradeMax}>/5</Text>
            </Text>
            <Text style={styles.gradeSubLabel}>Lipid layer classification</Text>
          </View>
        )}

        {/* Metrics grid */}
        {metricsItems.length > 0 && (
          <View className="mt-4">
            <MetricsGrid items={metricsItems} />
          </View>
        )}

        {/* Confidence row (for non-nibut — nibut already includes it in metrics) */}
        {resolvedTestType !== 'nibut' && result?.confidence_score != null && (
          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>Analysis confidence</Text>
            <Text style={styles.confidenceValue}>
              {(result.confidence_score * 100).toFixed(0)}%
            </Text>
          </View>
        )}

        {/* Action bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.8}
            onPress={() => router.replace('/(tabs)/')}
          >
            <Text style={styles.primaryButtonText}>Save &amp; finish</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.8}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Repeat test</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  loadingText: {
    fontSize: 15,
    color: '#475569',
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#0E7C7B',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  gradeCard: {
    backgroundColor: '#0E7C7B',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  gradeLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    marginBottom: 4,
  },
  gradeValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 56,
  },
  gradeMax: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.70)',
  },
  gradeSubLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    marginTop: 4,
  },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 12,
  },
  confidenceLabel: {
    fontSize: 14,
    color: '#475569',
  },
  confidenceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  actionBar: {
    marginTop: 24,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#0E7C7B',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0E7C7B',
  },
  secondaryButtonText: {
    color: '#0E7C7B',
    fontWeight: '600',
    fontSize: 16,
  },
});
