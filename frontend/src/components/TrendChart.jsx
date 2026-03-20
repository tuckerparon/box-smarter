import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

/**
 * Reusable time-series chart.
 * @param {Array}    data       — array of objects with xKey + line keys
 * @param {string}   xKey       — date/week field name
 * @param {string[]} lines      — metric keys to plot
 * @param {string}   accent     — primary line color
 * @param {Array}    annotations — [{x, label}] for event markers
 */
export default function TrendChart({ data, xKey, lines, accent, annotations = [] }) {
  const COLORS = [accent, '#ffffff80', '#ffffff40']

  if (!data || data.length === 0) {
    return (
      <div className="h-48 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center">
        <span className="text-gray-500 text-sm">No data yet</span>
      </div>
    )
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
          <XAxis dataKey={xKey} tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #ffffff20', borderRadius: 8 }}
            labelStyle={{ color: '#e5e7eb' }}
            itemStyle={{ color: accent }}
          />
          {annotations.map((a, i) => (
            <ReferenceLine key={i} x={a.x} stroke="#ffffff40" label={{ value: a.label, fill: '#9ca3af', fontSize: 10 }} />
          ))}
          {lines.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[i] || '#ffffff40'}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS[i] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
