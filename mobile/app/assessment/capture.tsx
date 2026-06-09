import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, BackHandler, StyleSheet, SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AlignmentOverlay, type CaptureState } from '@/components/capture/AlignmentOverlay';
import { CaptureButton } from '@/components/capture/CaptureButton';
import { StatePrompt } from '@/components/capture/StatePrompt';
import { TimerDisplay } from '@/components/capture/TimerDisplay';
import type { TestType } from '@shared/types/assessment';

const TEST_LABELS: Record<TestType, string> = {
  nibut: 'NIBUT Test',
  fluorescein: 'Fluorescein Test',
  lipid: 'Lipid Layer Test',
};

export default function CaptureScreen() {
  const { assessmentId, testType } = useLocalSearchParams<{
    assessmentId: string;
    testType: TestType;
  }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [captureState, setCaptureState] = useState<CaptureState>('READY');
  const [elapsed, setElapsed] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  // Simulated Placido ring detection — replace with real CV detection in Sprint 3
  useEffect(() => {
    const t1 = setTimeout(() => setCaptureState('ALIGNING'), 500);
    const t2 = setTimeout(() => setCaptureState('ALIGNED'), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Recording elapsed timer
  useEffect(() => {
    if (captureState !== 'RECORDING') return;
    setElapsed(0);
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [captureState]);

  // Android hardware back button — stop recording gracefully
  useEffect(() => {
    if (captureState !== 'RECORDING') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cameraRef.current?.stopRecording();
      return true;
    });
    return () => sub.remove();
  }, [captureState]);

  if (!permission) return <View style={styles.fill} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.fill, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>
          Camera access required
        </Text>
        <Text style={{ textAlign: 'center', color: '#475569', marginBottom: 24 }}>
          TearFlex needs camera access to record tear film videos. Please enable it in Settings.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{ backgroundColor: '#0E7C7B', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Grant permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  async function handleStartRecording() {
    setCaptureState('RECORDING');
    try {
      const video = await cameraRef.current?.recordAsync({ maxDuration: 25 });
      if (video?.uri) {
        setCaptureState('COMPLETE');
        router.replace({
          pathname: '/assessment/processing',
          params: { assessmentId, testType, videoUri: video.uri },
        });
      }
    } catch {
      setCaptureState('ALIGNED');
    }
  }

  function handleStopRecording() {
    cameraRef.current?.stopRecording();
    // recordAsync promise will resolve, triggering navigation above
  }

  return (
    <View style={styles.fill}>
      <StatusBar hidden />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="video"
        videoQuality="2160p"
      />

      {/* Alignment overlay (centred on camera) */}
      <AlignmentOverlay state={captureState} />

      {/* Top bar */}
      <View style={styles.topBar}>
        {captureState !== 'RECORDING' && (
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>✕</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.testLabel}>{TEST_LABELS[testType] ?? 'Capture'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TimerDisplay elapsed={elapsed} visible={captureState === 'RECORDING'} />
        <StatePrompt state={captureState} testType={testType} />
        <View style={{ height: 16 }} />
        <CaptureButton
          state={captureState}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />
        <View style={{ height: 32 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'black' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  cancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: 'white', fontSize: 18 },
  testLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
