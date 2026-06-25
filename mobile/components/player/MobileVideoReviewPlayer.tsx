import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Pressable, Text, StyleSheet } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { SpeedSelector } from './SpeedSelector'
import { ScrubBar } from './ScrubBar'
import { PlaybackControls } from './PlaybackControls'
import { clampTime, frameStepDelta } from './player-logic'
import type { CapturedFrame, PlayerMode } from './types'

// ---------------------------------------------------------------------------
// Real expo-video event name mapping — ONE place to update if names change.
// Verified against expo-video@2.0.6 (SDK 52):
//   statusChange  → { status: VideoPlayerStatus, error?: PlayerError }
//   timeUpdate    → { currentTime: number, ... }
//   playingChange → { isPlaying: boolean, ... }
// ---------------------------------------------------------------------------
const EV_STATUS = 'statusChange' as const
const EV_TIME = 'timeUpdate' as const
const EV_PLAYING = 'playingChange' as const

interface Props {
  source: string
  mode?: PlayerMode
  fps?: number
  initialRate?: number
  initiallyLooping?: boolean
  onCaptureFrame: (f: CapturedFrame) => void
  onReady?: (m: { durationSeconds: number; width: number; height: number }) => void
  onError?: () => void
  onExpand?: () => void
}

export function MobileVideoReviewPlayer({
  source,
  mode = 'review',
  fps = 30,
  initialRate = 1,
  initiallyLooping = true,
  onCaptureFrame,
  onReady,
  onError,
  onExpand,
}: Props) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = initiallyLooping
    p.playbackRate = initialRate
    // Without a non-zero interval, expo-video never emits `timeUpdate`, so the
    // scrub bar would never track playback position on-device.
    p.timeUpdateEventInterval = 0.25
  })

  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(initiallyLooping)
  const [speed, setSpeed] = useState<number>(initialRate)
  const [current, setCurrent] = useState(0)
  const [errored, setErrored] = useState(false)

  // Guard against calling onError more than once (e.g. both load-error and thumbnail-error)
  const errorFiredRef = useRef(false)

  const handleReady = useCallback(() => {
    // expo-video SDK 52: VideoPlayer does not expose video width/height directly.
    // Pass 0 for dimensions; capture-frame stills report real dimensions via getThumbnailAsync.
    onReady?.({ durationSeconds: player.duration, width: 0, height: 0 })
  }, [onReady, player])

  const handleError = useCallback(() => {
    setErrored(true)
    if (!errorFiredRef.current) {
      errorFiredRef.current = true
      onError?.()
    }
  }, [onError])

  // ---------------------------------------------------------------------------
  // Real expo-video event wiring (device correctness).
  // The mock in tests does not implement addListener — guard with ?. so tests pass
  // and the real native player receives events on-device.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const statusSub = (player as any).addListener?.(
      EV_STATUS,
      (payload: { status: string; error?: unknown }) => {
        if (payload.status === 'readyToPlay') handleReady()
        if (payload.status === 'error') handleError()
      },
    )
    const timeSub = (player as any).addListener?.(
      EV_TIME,
      (payload: { currentTime: number }) => {
        setCurrent(payload.currentTime)
      },
    )
    const playingSub = (player as any).addListener?.(
      EV_PLAYING,
      (payload: { isPlaying: boolean }) => {
        setPlaying(payload.isPlaying)
      },
    )
    return () => {
      statusSub?.remove()
      timeSub?.remove()
      playingSub?.remove()
    }
  }, [player, handleReady, handleError])

  // ---------------------------------------------------------------------------
  // Playback control handlers
  // ---------------------------------------------------------------------------
  const playPause = () => {
    if (playing) {
      player.pause()
      setPlaying(false)
    } else {
      player.play()
      setPlaying(true)
    }
  }

  const toggleLoop = () => {
    const next = !looping
    player.loop = next
    setLooping(next)
  }

  const stepBack = () => player.seekBy(-frameStepDelta(fps))
  const stepForward = () => player.seekBy(frameStepDelta(fps))

  const seek = (t: number) => {
    const ct = clampTime(t, player.duration)
    player.currentTime = ct
    setCurrent(ct)
  }

  const changeSpeed = (s: number) => {
    player.playbackRate = s
    setSpeed(s)
  }

  const captureFrame = async () => {
    player.pause()
    setPlaying(false)
    const t = player.currentTime
    try {
      const { uri, width, height } = await VideoThumbnails.getThumbnailAsync(source, {
        time: t * 1000,
      })
      onCaptureFrame({ uri, timestampSeconds: t, width, height })
    } catch {
      // Thumbnail failure is non-fatal: report error, do NOT emit a frame
      handleError()
    }
  }

  const compact = mode === 'compact'

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (errored) {
    return (
      <View style={styles.errorContainer} accessibilityRole="alert">
        <Text style={styles.errorText}>Couldn't load this video.</Text>
      </View>
    )
  }

  // ---------------------------------------------------------------------------
  // Normal render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <VideoView player={player} style={styles.video} />
      <ScrubBar current={current} duration={player.duration} onSeek={seek} />
      <PlaybackControls
        playing={playing}
        looping={looping}
        onPlayPause={playPause}
        onToggleLoop={toggleLoop}
        onStepBack={stepBack}
        onStepForward={stepForward}
        onCaptureFrame={captureFrame}
        showCapture={!compact}
        showLoop={!compact}
      />
      {!compact && <SpeedSelector value={speed} onChange={changeSpeed} />}
      {compact && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Expand"
          onPress={onExpand}
          style={styles.expandBtn}
        >
          <Text style={styles.expandLabel}>Expand</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444', // red-500
  },
  expandBtn: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    backgroundColor: '#F1F5F9', // slate-100
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  expandLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155', // slate-700
  },
})
