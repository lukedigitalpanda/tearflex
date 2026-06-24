import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STILL_BURST_COUNT = 5;
const VIDEO_MAX_MS = 1800;

function withFileScheme(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export default function TopographyCaptureScreen() {
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  async function handleCapture() {
    if (!camera.current || capturing) return;
    setCapturing(true);
    const stillUris: string[] = [];
    try {
      camera.current.startRecording({
        onRecordingFinished: (video) => {
          router.replace({
            pathname: '/assessment/topography-processing',
            params: {
              assessmentId: assessmentId ?? '',
              videoUri: withFileScheme(video.path),
              stillUris: JSON.stringify(stillUris),
            },
          });
        },
        onRecordingError: () => setCapturing(false),
      });
      for (let i = 0; i < STILL_BURST_COUNT; i++) {
        const photo = await camera.current.takePhoto();
        stillUris.push(withFileScheme(photo.path));
      }
      setTimeout(() => camera.current?.stopRecording(), VIDEO_MAX_MS);
    } catch {
      setCapturing(false);
    }
  }

  if (!hasPermission || !device) {
    return (
      <View style={styles.centred}>
        <StatusBar hidden />
        <Text style={styles.message}>
          {!hasPermission ? 'Camera permission is required.' : 'No rear camera available.'}
        </Text>
        <TouchableOpacity style={styles.cancel} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        video
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.cancelX}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.label}>Corneal Topography</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.ring} pointerEvents="none" />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.prompt}>
          {capturing ? 'Hold steady — capturing…' : 'Centre the rings, then tap to capture'}
        </Text>
        <TouchableOpacity
          style={[styles.shutter, capturing && styles.shutterBusy]}
          onPress={handleCapture}
          disabled={capturing}
          activeOpacity={0.8}
        >
          {capturing ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', gap: 16, paddingHorizontal: 32 },
  message: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  cancelX: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  ring: { position: 'absolute', alignSelf: 'center', top: '30%', width: 260, height: 260, borderRadius: 130, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', gap: 20 },
  prompt: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  shutter: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F97066', alignItems: 'center', justifyContent: 'center' },
  shutterBusy: { backgroundColor: '#475569' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#FFFFFF' },
  cancel: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  cancelText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
});
