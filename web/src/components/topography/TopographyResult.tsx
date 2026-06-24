import { Card } from '@/components/ui/card'
import { TopographyImage } from './TopographyImage'
import {
  calibrationLabel, dioptreColour, formatAxis, formatDioptre, RESEARCH_USE_DISCLAIMER,
} from '@/lib/topography'
import type { TopographyResult as TopographyResultData } from '@shared/types/topography'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  )
}

export function TopographyResult({ result }: { result: TopographyResultData }) {
  const colour = dioptreColour(result.central_k)
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        {RESEARCH_USE_DISCLAIMER}
      </div>

      <Card className="p-6" style={{ backgroundColor: `${colour}18` }}>
        <div className="text-xs uppercase text-muted-foreground">Central K (assumed scale)</div>
        <div className="text-5xl font-bold tabular-nums" style={{ color: colour }}>
          {formatDioptre(result.central_k)}
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        <Metric label="SimK flat" value={formatDioptre(result.sim_k_flat)} />
        <Metric label="SimK steep" value={formatDioptre(result.sim_k_steep)} />
        <Metric label="Steep axis" value={formatAxis(result.sim_k_axis)} />
        <Metric label="Astigmatism" value={formatDioptre(result.astigmatism_magnitude)} />
        <Metric label="Astig. axis" value={formatAxis(result.astigmatism_axis)} />
        <Metric
          label="Confidence"
          value={result.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'}
        />
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold">Axial curvature map</h3>
          <TopographyImage url={result.axial_map} alt="Axial curvature map" />
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Detected rings</h3>
          <TopographyImage url={result.ring_overlay} alt="Detected Placido rings" />
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Algorithm {result.algorithm_version || '—'} · {calibrationLabel(result.calibration_state)}
      </p>
    </div>
  )
}
