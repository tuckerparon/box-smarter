import InfoTooltip from './InfoTooltip'

/**
 * Displays a single metric with label, value, unit, and optional citation tooltip.
 * @param {string}  label
 * @param {number|null} value       — null renders a loading placeholder
 * @param {string}  unit
 * @param {string}  accent          — hex color for value text
 * @param {boolean} lowerIsBetter   — flips direction indicator
 * @param {string}  citation        — shown in ⓘ tooltip
 * @param {string}  formula         — shown in ⓘ tooltip
 * @param {number|null} delta       — change vs previous session
 */
export default function MetricCard({ label, value, unit, accent, lowerIsBetter, citation, formula, delta }) {
  const isLoading = value === null || value === undefined

  return (
    <div className="bg-white/5 rounded-xl p-5 flex flex-col gap-2 border border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400 font-medium">{label}</span>
        {(citation || formula) && <InfoTooltip citation={citation} formula={formula} />}
      </div>

      {isLoading ? (
        <div className="h-8 w-20 bg-white/10 rounded animate-pulse" />
      ) : (
        <span className="text-2xl font-bold" style={{ color: accent }}>
          {value}
          <span className="text-sm text-gray-400 ml-1">{unit}</span>
        </span>
      )}

      {delta !== undefined && delta !== null && (
        <span className={`text-xs font-medium ${getDeltaColor(delta, lowerIsBetter)}`}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)} vs prev
        </span>
      )}
    </div>
  )
}

function getDeltaColor(delta, lowerIsBetter) {
  const positive = lowerIsBetter ? delta < 0 : delta > 0
  if (delta === 0) return 'text-gray-400'
  return positive ? 'text-green-400' : 'text-red-400'
}
