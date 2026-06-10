'use client'
import { useTheme } from 'next-themes'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'

interface Point { date: string; nibut: number }

export function TrendChart({ data, normal = 10, borderline = 5 }: { data: Point[]; normal?: number; borderline?: number }) {
  const { resolvedTheme } = useTheme()
  const axisColor = resolvedTheme === 'dark' ? '#94a3b8' : '#475569'
  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    color: 'hsl(var(--foreground))',
  }

  if (data.length === 0) return <p className="text-sm text-muted-foreground">No trend data yet.</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: axisColor }} stroke={axisColor} />
        <YAxis tick={{ fontSize: 12, fill: axisColor }} stroke={axisColor} unit="s" />
        <Tooltip contentStyle={tooltipStyle} />
        <ReferenceLine y={normal} stroke="#4ADE80" strokeDasharray="4 4" />
        <ReferenceLine y={borderline} stroke="#FBBF24" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="nibut" stroke="#0E7C7B" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
