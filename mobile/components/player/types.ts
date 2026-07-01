export interface CapturedFrame {
  uri: string
  timestampSeconds: number
  width: number
  height: number
}

export type PlayerMode = 'review' | 'compact'

export const SPEED_STEPS = [1, 0.75, 0.5, 0.25, 0.1] as const
export type SpeedStep = (typeof SPEED_STEPS)[number]
