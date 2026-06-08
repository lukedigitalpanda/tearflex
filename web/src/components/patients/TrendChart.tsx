'use client'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'

interface Point { date: string; nibut: number }

export function TrendChart({ data, normal = 10, borderline = 5 }: { data: Point[]; normal?: number; borderline?: number }) {
  if (data.length === 0) return <p className="text-sm text-slate-600">No trend data yet.</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#475569" />
        <YAxis tick={{ fontSize: 12 }} stroke="#475569" unit="s" />
        <Tooltip />
        <ReferenceLine y={normal} stroke="#4ADE80" strokeDasharray="4 4" />
        <ReferenceLine y={borderline} stroke="#FBBF24" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="nibut" stroke="#0E7C7B" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
