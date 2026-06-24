import { nibutBand, severityMeta, type NibutThresholds } from '@/lib/severity'
import { TearFilmHeatmap } from './TearFilmHeatmap'
import { Card } from '@/components/ui/card'
import type { TestResult } from '@shared/types/assessment'

const OXFORD_LABELS: Record<number, string> = {
  0: 'Absent', 1: 'Minimal', 2: 'Mild', 3: 'Moderate', 4: 'Marked', 5: 'Severe',
}

const GUILLON_LABELS: Record<number, string> = {
  1: 'Open meshwork', 2: 'Closed meshwork', 3: 'Wave / flow', 4: 'Amorphous', 5: 'Coloured fringes',
}

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

  const fluoresceinValue = result.fluorescein_grade != null
    ? `${result.fluorescein_grade} — ${OXFORD_LABELS[result.fluorescein_grade] ?? ''}`
    : 'Not assessed'

  const lipidValue = result.lipid_grade != null
    ? `${result.lipid_grade} — ${GUILLON_LABELS[result.lipid_grade] ?? ''}`
    : 'Not assessed'

  const lipidProvisional =
    result.lipid_grade != null && (result.analysis_version ?? '').startsWith('lipid-v0')

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
        <Metric label="Fluorescein grade" value={fluoresceinValue} />
        <div>
          <div className="text-xs uppercase text-muted-foreground">
            Lipid grade
            {lipidProvisional && (
              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                Provisional
              </span>
            )}
          </div>
          <div className="font-medium tabular-nums">{lipidValue}</div>
        </div>
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
