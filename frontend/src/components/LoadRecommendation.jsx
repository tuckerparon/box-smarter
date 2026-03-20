/**
 * Sparring load recommendation widget.
 * Implements MNLM framework (Dutton et al., 2022):
 *   Alert if >1.5 SD decline in any domain OR >1.0 SD in two+ domains.
 *   EEG: 60% weight, Reaction time: 30%, HRV/symptoms: 10%
 *
 * TODO: fetch from /api/pison/load-recommendation
 */
export default function LoadRecommendation({ recommendation, accent }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Sparring Load Recommendation</h2>
        <span className="text-xs text-gray-500">Last 7 days · MNLM framework</span>
      </div>

      {!recommendation ? (
        <div className="text-gray-500 text-sm">Collecting baseline data…</div>
      ) : (
        <>
          <p className="text-xl font-bold mb-1" style={{ color: accent }}>
            {recommendation.recommendation}
          </p>
          {recommendation.confidence && (
            <p className="text-sm text-gray-400 mb-4">
              Confidence: {recommendation.confidence}%
            </p>
          )}
          {recommendation.details && (
            <div className="grid grid-cols-3 gap-3 text-xs mt-3">
              <div className="bg-white/5 rounded-lg p-2 text-center">
                <div className="text-gray-400">Avg Readiness (7d)</div>
                <div className="font-semibold text-white">{recommendation.details.avg_readiness_ms_last7d} ms</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 text-center">
                <div className="text-gray-400">vs Baseline</div>
                <div className="font-semibold text-yellow-400">+{recommendation.details.pct_above_baseline}%</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 text-center">
                <div className="text-gray-400">Baseline</div>
                <div className="font-semibold text-white">{recommendation.details.baseline_ms} ms</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DomainBadge({ label, status, weight }) {
  const color = status === 'ok' ? 'text-green-400 border-green-400/30' :
                status === 'caution' ? 'text-yellow-400 border-yellow-400/30' :
                'text-red-400 border-red-400/30'
  return (
    <div className={`border rounded-lg p-2 text-center ${color}`}>
      <div className="font-semibold">{label}</div>
      <div className="text-gray-500">{weight}</div>
    </div>
  )
}
