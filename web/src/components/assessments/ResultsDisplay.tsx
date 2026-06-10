import { nibutBand, severityMeta, type NibutThresholds } from '@/lib/severity'
import { TearFilmHeatmap } from './TearFilmHeatmap'
import { Card } from '@/components/ui/card'
import type { TestResult } from '@shared/types/assessment'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  )
}

export function ResultsDisplay({ result, thresholds }: { result: TestResult; thresholds: NibutThresholds }) {
  const band = nibutBand(result.nibut_first_breakup_seconds, thresholds)
  const sev = severityMeta(result.dry_eye_severity)

  return (
    <div className="space-y-4">
      <Card className="p-6" style={{ backgroundColor: `${band.color}18` }}>
        <div className="text-xs uppercase text-muted-foreground">NIBUT — first break-up</div>
        <div className="text-5xl font-bold tabular-nums" style={{ color: band.color }}>
          {result.nibut_first_breakup_seconds != null ? `${result.nibut_first_breakup_seconds.toFixed(1)}s` : '—'}
        </div>
        <div className="mt-1 text-sm font-medium" style={{ color: sev.color }}>{sev.label}</div>
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        <Metric label="NIBUT mean" value={result.nibut_mean_breakup_seconds != null ? `${result.nibut_mean_breakup_seconds.toFixed(1)}s` : 'Not assessed'} />
        <Metric label="Fluorescein grade" value={result.fluorescein_grade != null ? String(result.fluorescein_grade) : 'Not assessed'} />
        <Metric label="Lipid grade" value={result.lipid_grade != null ? String(result.lipid_grade) : 'Not assessed'} />
        <Metric label="Tear meniscus" value={result.tear_meniscus_height_mm != null ? `${result.tear_meniscus_height_mm}mm` : 'Not assessed'} />
        <Metric label="Confidence" value={result.confidence_score != null ? `${Math.round(result.confidence_score * 100)}%` : 'Not assessed'} />
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Tear film heatmap</h3>
        <TearFilmHeatmap url={result.nibut_heatmap} />
      </Card>
    </div>
  )
}
