import { View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RESEARCH_USE_DISCLAIMER } from '@shared/constants/topography';
import type { TopographyScan } from '@shared/types/topography';

function fmtD(d: number | null): string {
  return d != null ? `${d.toFixed(2)} D` : '—';
}
function fmtAxis(a: number | null): string {
  return a != null ? `${Math.round(a)}°` : '—';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 mb-4">
      <Text className="text-xs uppercase text-slate-500">{label}</Text>
      <Text className="text-base font-semibold text-slate-900 tabular-nums">{value}</Text>
    </View>
  );
}

function TopoImage({ uri, label }: { uri: string | null; label: string }) {
  return (
    <View className="mb-4">
      <Text className="font-semibold text-slate-900 mb-2">{label}</Text>
      {uri
        ? <Image source={{ uri }} className="w-full h-64 rounded-lg" resizeMode="contain" />
        : (
          <View className="w-full h-48 rounded-lg bg-slate-200 items-center justify-center">
            <Text className="text-slate-500 text-sm">Not available</Text>
          </View>
        )}
    </View>
  );
}

export default function TopographyResultsScreen() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['topography-scan', scanId],
    queryFn: () => api.get<TopographyScan>(`topography/scans/${scanId}/`),
    enabled: !!scanId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#0E7C7B" />
      </SafeAreaView>
    );
  }

  const result = data?.result ?? null;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-xl font-bold text-slate-900 pt-4 mb-4">Corneal Topography</Text>

        <View className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 mb-4">
          <Text className="text-sm font-medium text-amber-900">{RESEARCH_USE_DISCLAIMER}</Text>
        </View>

        {isError || !result ? (
          <Text className="text-slate-600 text-base">Result not available.</Text>
        ) : (
          <>
            <View className="rounded-xl bg-white p-5 mb-4">
              <Text className="text-xs uppercase text-slate-500">Central K (assumed scale)</Text>
              <Text className="text-5xl font-bold text-teal-700 tabular-nums">{fmtD(result.central_k)}</Text>
            </View>

            <View className="rounded-xl bg-white p-5 mb-4 flex-row flex-wrap">
              <Metric label="SimK flat" value={fmtD(result.sim_k_flat)} />
              <Metric label="SimK steep" value={fmtD(result.sim_k_steep)} />
              <Metric label="Steep axis" value={fmtAxis(result.sim_k_axis)} />
              <Metric label="Astigmatism" value={fmtD(result.astigmatism_magnitude)} />
              <Metric label="Astig. axis" value={fmtAxis(result.astigmatism_axis)} />
              <Metric label="Confidence" value={result.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'} />
            </View>

            <View className="rounded-xl bg-white p-5 mb-4">
              <TopoImage uri={result.axial_map} label="Axial curvature map" />
              <TopoImage uri={result.ring_overlay} label="Detected rings" />
            </View>

            <Text className="text-xs text-slate-500 mb-4">
              Algorithm {result.algorithm_version || '—'} · {result.calibration_state || 'uncalibrated'}
            </Text>
          </>
        )}

        <TouchableOpacity
          className="bg-teal-600 rounded-xl py-4 items-center mt-2 mb-8"
          onPress={() => router.replace('/(tabs)/')}
          activeOpacity={0.8}
        >
          <Text className="text-white font-semibold text-base">Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
