import { useState } from 'react'
import { useDashboardData } from '../hooks/useDashboardData'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ComposedChart, Area,
} from 'recharts'

// ─── ⓘ Info Tooltip ──────────────────────────────────────────────────────────

function Info({ title, formula, citation }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle ml-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="rounded-full w-4 h-4 inline-flex items-center justify-center transition-opacity hover:opacity-100"
        style={{ opacity: 0.45, fontSize: '10px', background: 'rgba(255,255,255,0.08)', color: 'inherit' }}
        title="Click for methodology"
      >ⓘ</button>
      {open && (
        <div
          className="absolute z-50 left-0 top-6 w-80 shadow-2xl p-4"
          style={{ background: '#1a1a2e', border: '1px solid #2d2d4a', color: '#d1d5db' }}
        >
          {title && <p className="text-sm font-semibold mb-2 text-white leading-snug">{title}</p>}
          {formula && (
            <p className="font-mono text-xs bg-black/40 rounded-sm px-3 py-2 mb-3 text-emerald-300 leading-relaxed">
              {formula}
            </p>
          )}
          {citation && <p className="text-xs italic text-gray-400 leading-relaxed">{citation}</p>}
          <button
            onClick={() => setOpen(false)}
            className="mt-3 text-xs text-gray-500 hover:text-white transition-colors"
          >
            ✕ close
          </button>
        </div>
      )}
    </span>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionTitle({ t, children, info, sub }) {
  return (
    <div className="mb-4">
      <h2
        className="text-sm font-semibold tracking-wide uppercase flex items-center gap-1 pl-3"
        style={{ color: t.text, borderLeft: `2px solid ${t.accent}`, letterSpacing: '0.06em' }}
      >
        {children}{info && <Info {...info} />}
      </h2>
      {sub && <p className="text-xs mt-1 pl-3" style={{ color: t.dimText }}>{sub}</p>}
    </div>
  )
}

function Card({ t, children, className = '' }) {
  return (
    <div
      className={`rounded p-5 ${className}`}
      style={{ background: t.cardBg, border: `1px solid ${t.border}` }}
    >
      {children}
    </div>
  )
}

function Skeleton({ t, h = 'h-48' }) {
  return <div className={`${h} rounded animate-pulse`} style={{ background: t.border }} />
}

function MetricTile({ t, label, value, unit, info, highlight }) {
  return (
    <div
      className="rounded p-4 flex flex-col gap-1"
      style={{ background: `${t.bg}99`, border: `1px solid ${t.border}` }}
    >
      <p className="text-xs flex items-center gap-0.5" style={{ color: t.subtext }}>
        {label}{info && <Info {...info} />}
      </p>
      <p className="text-2xl font-bold leading-none" style={{ color: highlight || t.text }}>
        {value ?? '—'}
      </p>
      {unit && <p className="text-xs" style={{ color: t.dimText }}>{unit}</p>}
    </div>
  )
}

const CONTACT_LABELS = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' }
const CONTACT_COLORS = { None: '#6b7280', Low: '#facc15', Medium: '#f97316', High: '#ef4444' }

// ─── Interpretation box ───────────────────────────────────────────────────────

function InterpretationBox({ t, lines }) {
  if (!lines?.length) return null
  return (
    <div className="mb-4 pl-3" style={{ borderLeft: `2px solid ${t.border}` }}>
      {lines.map((line, i) => (
        <p key={i} className="text-xs leading-relaxed" style={{ color: t.dimText, marginTop: i > 0 ? '0.4rem' : 0 }}>
          {line}
        </p>
      ))}
    </div>
  )
}

// ─── Interpretation builders ──────────────────────────────────────────────────

function buildABInterpretation(data) {
  if (!data) return null
  const lines = []
  const hrv = data.whoop?.hrv_ms
  const rec = data.whoop?.recovery_pct
  const rt  = data.pison?.readiness_ms
  const atr = data.eeg?.alpha_theta_ratio

  if (hrv?.sparring?.mean != null && hrv?.non_sparring?.mean != null) {
    const sp = hrv.sparring.mean, ns = hrv.non_sparring.mean
    const pct = Math.abs(((sp - ns) / ns) * 100).toFixed(1)
    const dir = sp < ns ? 'lower' : 'higher'
    lines.push(`HRV averaged ${sp.toFixed(0)} ms on sparring days vs ${ns.toFixed(0)} ms on non-sparring days — ${pct}% ${dir}, consistent with greater autonomic stress from head contact (Coutts et al., 2007).`)
  }
  if (rec?.sparring?.mean != null && rec?.non_sparring?.mean != null) {
    const sp = rec.sparring.mean, ns = rec.non_sparring.mean
    const pct = Math.abs(((sp - ns) / ns) * 100).toFixed(1)
    const dir = sp < ns ? 'lower' : 'higher'
    lines.push(`Recovery was ${sp.toFixed(0)}% on sparring days vs ${ns.toFixed(0)}% on non-sparring days (${pct}% ${dir}).`)
  }
  if (rt?.sparring?.mean != null && rt?.non_sparring?.mean != null) {
    const sp = rt.sparring.mean, ns = rt.non_sparring.mean
    const dir = sp > ns ? 'slower' : 'faster'
    lines.push(`Reaction time (EMG) was ${sp.toFixed(0)} ms on sparring days vs ${ns.toFixed(0)} ms on non-sparring — ${dir} on contact days.`)
  }
  if (atr?.sparring?.mean != null && atr?.non_sparring?.mean != null) {
    const sp = atr.sparring.mean, ns = atr.non_sparring.mean
    const dir = sp < ns ? 'lower' : 'higher'
    lines.push(`Alpha/theta ratio (EEG) was ${dir} on sparring days (${sp.toFixed(3)} vs ${ns.toFixed(3)}), suggesting ${sp < ns ? 'reduced cortical arousal' : 'maintained cortical state'} on contact days.`)
  }
  return lines.length ? lines : null
}

function buildPrePostInterpretation(data) {
  if (!data) return null
  const lines = []
  // helper: formats with sign, never produces "+-"
  const signed = (v, dec = 1) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(dec)

  const r = data.readiness
  if (r?.boxing?.mean != null && r?.sparring?.mean != null) {
    const bx = r.boxing.mean, sp = r.sparring.mean
    // readiness = reaction time, higher delta = slower = worse
    lines.push(
      Math.abs(sp) > Math.abs(bx)
        ? `Reaction time (EMG): post-sparring Δ ${signed(sp)} ms vs post-boxing Δ ${signed(bx)} ms — the larger shift after sparring is consistent with greater neuromuscular fatigue from head contact (Strangman et al., 2018).`
        : `Reaction time (EMG): post-sparring Δ ${signed(sp)} ms vs post-boxing Δ ${signed(bx)} ms — no meaningful difference in neuromuscular cost between contact and non-contact days in these sessions.`
    )
  }

  const a = data.agility
  if (a?.boxing?.mean != null && a?.sparring?.mean != null) {
    const bx = a.boxing.mean, sp = a.sparring.mean
    // agility: negative delta = declined = worse
    lines.push(
      Math.abs(sp) > Math.abs(bx) && sp < bx
        ? `Agility (EMG): post-sparring Δ ${signed(sp)} pts vs post-boxing Δ ${signed(bx)} pts — larger motor-control cost on contact days.`
        : `Agility (EMG): post-sparring Δ ${signed(sp)} pts vs post-boxing Δ ${signed(bx)} pts — agility was not disproportionately affected by head contact.`
    )
  }

  const atr = data.eeg?.alpha_theta_ratio
  if (atr?.boxing?.mean != null && atr?.sparring?.mean != null) {
    const bx = atr.boxing.mean, sp = atr.sparring.mean
    const worse = sp < bx && sp < 0
    lines.push(
      `Alpha/theta ratio (EEG): post-sparring Δ ${signed(sp, 3)} vs post-boxing Δ ${signed(bx, 3)} — ${worse ? 'greater cognitive fatigue signature on sparring days, consistent with cumulative neural load from head contact (Klimesch, 1999).' : 'no clear EEG fatigue differential between session types.'}`
    )
  }

  const ra = data.eeg?.rel_alpha_eo
  if (ra?.boxing?.mean != null && ra?.sparring?.mean != null) {
    const bx = ra.boxing.mean, sp = ra.sparring.mean
    lines.push(
      `Relative alpha power (EEG): post-sparring Δ ${signed(sp*100, 2)}% vs post-boxing Δ ${signed(bx*100, 2)}% — ${sp < bx ? 'greater alpha suppression post-sparring suggests higher cortical arousal cost.' : 'alpha power was maintained similarly across session types.'}`
    )
  }

  const sef = data.eeg?.sef90
  if (sef?.boxing?.mean != null && sef?.sparring?.mean != null) {
    const bx = sef.boxing.mean, sp = sef.sparring.mean
    lines.push(`SEF90 (EEG): post-sparring Δ ${signed(sp, 2)} Hz vs post-boxing Δ ${signed(bx, 2)} Hz — ${sp < bx ? 'spectral slowing post-sparring suggests a transient shift in global brain state.' : 'no spectral slowing differential between session types.'}`)
  }

  return lines.length ? lines : null
}

function buildLongitudinalInterpretation(data) {
  if (!data?.length || data.length < 2) return null
  const lines = []
  const first = data[0], last = data[data.length - 1]

  if (first.hrv_ms != null && last.hrv_ms != null) {
    const delta = last.hrv_ms - first.hrv_ms
    lines.push(`HRV has ${delta > 0 ? 'improved' : 'declined'} by ${Math.abs(delta).toFixed(0)} ms since camp started (${first.hrv_ms.toFixed(0)} → ${last.hrv_ms.toFixed(0)} ms).`)
  }
  if (first.recovery_pct != null && last.recovery_pct != null) {
    const delta = last.recovery_pct - first.recovery_pct
    lines.push(`Recovery ${delta > 0 ? 'improved' : 'declined'} from ${first.recovery_pct.toFixed(0)}% to ${last.recovery_pct.toFixed(0)}% over the camp period.`)
  }
  if (first.alpha_theta_ratio != null && last.alpha_theta_ratio != null) {
    const delta = last.alpha_theta_ratio - first.alpha_theta_ratio
    lines.push(`Alpha/theta ratio (EEG) ${delta > 0 ? 'increased' : 'decreased'} from ${first.alpha_theta_ratio.toFixed(3)} to ${last.alpha_theta_ratio.toFixed(3)} — ${delta > 0 ? 'trending toward better cognitive readiness' : 'trending toward neural fatigue'} across the camp.`)
  }
  return lines.length ? lines : null
}

function buildNeuroInterpretation(data, agent) {
  if (!data || !agent) return null
  const agentData = data[agent] ?? {}
  const lines = []

  const hrv = agentData.hrv_ms
  if (hrv?.with?.mean != null && hrv?.without?.mean != null) {
    const pct = ((hrv.with.mean - hrv.without.mean) / hrv.without.mean * 100).toFixed(1)
    const dir = hrv.with.mean > hrv.without.mean ? 'higher' : 'lower'
    lines.push(`HRV was ${Math.abs(pct)}% ${dir} on days with ${agent} (${hrv.with.mean.toFixed(0)} vs ${hrv.without.mean.toFixed(0)} ms).`)
  }
  const rt = agentData.readiness_ms
  if (rt?.with?.mean != null && rt?.without?.mean != null) {
    const dir = rt.with.mean < rt.without.mean ? 'faster' : 'slower'
    lines.push(`Reaction time was ${rt.with.mean.toFixed(0)} ms with ${agent} vs ${rt.without.mean.toFixed(0)} ms without — ${dir} responses on ${agent} days.`)
  }
  const atr = agentData.alpha_theta_ratio
  if (atr?.with?.mean != null && atr?.without?.mean != null) {
    const dir = atr.with.mean > atr.without.mean ? 'higher' : 'lower'
    lines.push(`Alpha/theta ratio (EEG) was ${dir} with ${agent} (${atr.with.mean.toFixed(3)} vs ${atr.without.mean.toFixed(3)}), suggesting ${atr.with.mean > atr.without.mean ? 'better cortical arousal' : 'no EEG benefit'} on ${agent} days. Note: small n — interpret with caution.`)
  }
  return lines.length ? lines : null
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard({ theme: t }) {
  const { data, loading, error } = useDashboardData()

  if (error) return (
    <div style={{ background: t.bg }} className="min-h-screen flex items-center justify-center">
      <p style={{ color: t.subtext }}>Could not load data. Check that the API is reachable.</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: t.bg, color: t.text, fontFamily: t.fontFamily }}>
      <div className="max-w-5xl mx-auto px-5 py-8 space-y-10">

        {/* ── A. Header ─────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between pb-5" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none" style={{ color: t.text }}>
              Tucker Paron
            </h1>
            <p className="text-xs mt-1.5" style={{ color: t.subtext }}>
              Boxing Camp &nbsp;·&nbsp; Jan 15 – May 7, 2026 &nbsp;·&nbsp; Rock 'N Rumble XV Boston
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://haymakersforhope.org/events/boxing/rock-n-rumble-xv-boston-2026/fighters/tucker-paron"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-3 py-1.5 transition-opacity hover:opacity-80"
              style={{
                background: t.accent,
                color: '#000',
                letterSpacing: '0.04em',
              }}
            >
              Donate
            </a>
            {t.logo && (
              <img src={t.logo} alt={t.name} className="h-6 object-contain" style={{ opacity: 0.6 }} />
            )}
          </div>
        </header>

        {/* ── D. A/B — Sparring vs Non-Sparring ────────────────────────────── */}
        <section>
          <SectionTitle
            t={t}
            info={{
              title: 'A/B Analysis: Sparring vs Non-Sparring Days',
              formula: 'Mann-Whitney U test (non-parametric; appropriate for n<30 non-normal data)',
              citation: 'Coutts et al. (2007) EJAP — HRV suppression on high-contact training days; bars show 90% bootstrap CI',
            }}
          >
            A/B — Sparring vs Non-Sparring Days
          </SectionTitle>
          {!loading && <InterpretationBox t={t} lines={buildABInterpretation(data?.abSparring)} />}
          {loading ? <Skeleton t={t} /> : <ABChart t={t} data={data?.abSparring} />}
        </section>

        {/* ── E. Pre/Post Delta ─────────────────────────────────────────────── */}
        <section>
          <SectionTitle
            t={t}
            info={{
              title: 'Pre → Post Session Delta',
              formula: 'Δ = Post_value − Pre_value  (readings within 1h of session)',
              citation: 'Strangman et al. (2018) Concussion — acute neuromuscular fatigue marker; larger Δ on sparring days expected from cumulative head contact',
            }}
          >
            Pre → Post Delta: Boxing vs Sparring
          </SectionTitle>
          {!loading && <InterpretationBox t={t} lines={buildPrePostInterpretation(data?.prePostDelta)} />}
          {loading ? <Skeleton t={t} h="h-44" /> : <PrePostChart t={t} data={data?.prePostDelta} />}
        </section>

        {/* ── F. Metrics Over Camp ──────────────────────────────────────────── */}
        <section>
          <SectionTitle
            t={t}
            info={{
              title: 'Longitudinal Trends + Head Contact Score',
              formula: 'contact_score = mean(None→0, Low→1, Medium→2, High→3) per week',
              citation: 'Dashnaw et al. (2012) Sports Health — cumulative sub-concussive exposure scoring; Lempke et al. (2020) — weekly contact load and HRV suppression',
            }}
          >
            Metrics Over Camp
          </SectionTitle>
          {!loading && <InterpretationBox t={t} lines={buildLongitudinalInterpretation(data?.longitudinal)} />}
          {loading ? <Skeleton t={t} h="h-80" /> : <LongitudinalChart t={t} data={data?.longitudinal} />}
        </section>

        {/* ── G. Neuroprotective Agent Effects ─────────────────────────────── */}
        <section>
          <SectionTitle
            t={t}
            info={{
              title: 'Neuroprotective Agent Effects',
              formula: 'Acute: same-day grouping (with/without). Cumulative: Pearson r(HRV, Σcreatine_days)',
              citation: 'Rawson & Venezia (2011) Amino Acids — creatine neuroprotection via phosphocreatine buffering; Nehlig (2010) J Alzheimers Dis — caffeine and cognitive performance',
            }}
          >
            Neuroprotective Agent Effects
          </SectionTitle>
          {loading ? <Skeleton t={t} /> : <NeuroprotectivePanel t={t} data={data?.neuroprotective} />}
        </section>

        {/* ── H. Sparring Load Recommendation ─────────────────────────────── */}
        <section>
          <SectionTitle
            t={t}
            info={{
              title: 'Multidimensional Neurological Load Management',
              formula: 'Score = 0.50×Recovery + 0.35×HRV + 0.15×RHR (normalized to baseline)',
              citation: 'Dutton et al. (2022) Int J Sports Physiol Perform; Flatt et al. (2017) IJSPP — recovery <33% = red zone',
            }}
            sub="Based on last 7 days of WHOOP data vs personal baseline"
          >
            Sparring Load Recommendation
          </SectionTitle>
          {loading ? <Skeleton t={t} h="h-36" /> : <RecommendationCard t={t} data={data?.recommendation} />}
        </section>

      </div>
    </div>
  )
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({ t, data: rec }) {
  if (!rec) return <p style={{ color: t.subtext }} className="text-sm">No recommendation available.</p>

  const n = rec.sessions_allowed ?? 0
  const sessionColor = n === 0 ? '#ef4444' : n === 1 ? '#facc15' : t.accent
  // Domain labels and weights — PPG sub-domains + EMG + EEG
  const domainLabels  = { recovery: 'Recovery (PPG)', hrv: 'HRV (PPG)', rhr: 'RHR (PPG)', eeg: 'Alpha/Theta (EEG)', emg: 'Reaction Time (EMG)' }
  const domainWeights = { recovery: '17.5%', hrv: '12.25%', rhr: '5.25%', eeg: '35%', emg: '30%' }

  const sessionLabel = n === 0
    ? 'sparring sessions recommended'
    : n === 1
    ? 'sparring session recommended'
    : 'sparring sessions recommended'

  const rationale = n === 0
    ? 'Your physiological markers indicate insufficient recovery for head-contact training this week.'
    : n === 1
    ? 'Metrics support one sparring session. Monitor recovery closely before scheduling a second.'
    : 'Your metrics are within healthy ranges. Two sparring sessions this week are supported by your data.'

  return (
    <Card t={t}>
      {/* Hero: session count */}
      <div className="flex items-end gap-5 pb-5" style={{ borderBottom: `1px solid ${t.border}` }}>
        <div>
          <span className="font-black leading-none" style={{ fontSize: '5rem', color: sessionColor, lineHeight: 1 }}>
            {n}
          </span>
        </div>
        <div className="pb-2">
          <p className="text-lg font-semibold leading-snug" style={{ color: t.text }}>{sessionLabel}</p>
          <p className="text-xs mt-1" style={{ color: t.subtext }}>
            {rec.confidence}% confidence &nbsp;·&nbsp; overall score {rec.overall_score}/100
          </p>
        </div>
      </div>

      {/* Rationale */}
      <p className="text-sm leading-relaxed mt-4" style={{ color: t.subtext }}>{rationale}</p>

      {rec.flags?.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rec.flags.map((f, i) => (
            <li key={i} className="text-xs flex items-start gap-2">
              <span style={{ color: '#ef4444' }} className="shrink-0 mt-0.5">⚠</span>
              <span style={{ color: t.subtext }}>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Domain scores */}
      <div className="mt-5 space-y-2.5">
        {Object.entries(rec.domain_scores ?? {}).map(([key, score]) => {
          const color = score >= 75 ? t.accent : score >= 50 ? '#facc15' : '#ef4444'
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-28 shrink-0">
                <span className="text-xs" style={{ color: t.subtext }}>{domainLabels[key]}</span>
                <span className="text-xs" style={{ color: t.dimText }}>{domainWeights[key]}</span>
              </div>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: t.border }}>
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
              </div>
              <span className="text-xs font-semibold w-8 text-right" style={{ color }}>{score.toFixed(0)}</span>
            </div>
          )
        })}
      </div>

      {rec.thresholds && (
        <p className="text-xs mt-4" style={{ color: t.dimText }}>
          Thresholds: Recovery red zone &lt;{rec.thresholds.recovery_red_zone}% &nbsp;·&nbsp;
          HRV decline &gt;{rec.thresholds.hrv_decline_pct}% &nbsp;·&nbsp;
          RHR rise &gt;{rec.thresholds.rhr_rise_pct}%
          <Info
            title="Threshold Sources"
            formula="Recovery < 33% → high injury risk (WHOOP red zone)"
            citation="Flatt et al. (2017) IJSPP; Buchheit (2014) Front Physiol — HRV-guided training load"
          />
        </p>
      )}
    </Card>
  )
}

// ─── EEG A/B Small Multiples (avoids cross-metric scale distortion) ──────────

function EEGABSmallMultiples({ t, data }) {
  const entries = Object.entries(data)
  if (!entries.length) return <p className="text-sm py-8 text-center" style={{ color: t.dimText }}>No EEG A/B data yet.</p>

  return (
    <div className="space-y-3">
      {entries.map(([key, m]) => {
        const sp  = m.sparring?.mean
        const nsp = m.non_sparring?.mean
        if (sp == null && nsp == null) return null
        const maxVal = Math.max(Math.abs(sp ?? 0), Math.abs(nsp ?? 0), 0.001)

        const fmtVal = (v) => {
          if (v == null) return '—'
          if (key === 'sef90') return v.toFixed(1)
          if (key.startsWith('rel_')) return `${(v * 100).toFixed(1)}%`
          return v.toFixed(3)
        }

        return (
          <div key={key} className="rounded p-3" style={{ background: `${t.bg}99`, border: `1px solid ${t.border}` }}>
            <p className="text-xs font-semibold mb-2" style={{ color: t.subtext }}>
              {m.label}
              {m.insufficient_n && <span className="ml-2 font-normal" style={{ color: '#facc15' }}>⚠ small n</span>}
            </p>
            <div className="space-y-2">
              {[
                { label: 'Sparring',     val: sp,  color: t.accent,  n: m.sparring?.n },
                { label: 'Non-Sparring', val: nsp, color: t.accent2, n: m.non_sparring?.n },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs w-24 shrink-0" style={{ color: t.dimText }}>
                    {row.label} {row.n != null ? `(n=${row.n})` : ''}
                  </span>
                  <div className="flex-1 h-4 rounded" style={{ background: t.border }}>
                    <div
                      className="h-4 rounded transition-all"
                      style={{
                        width: row.val != null ? `${Math.abs(row.val) / maxVal * 100}%` : '0%',
                        background: row.color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-14 text-right" style={{ color: row.color }}>
                    {fmtVal(row.val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <p className="text-xs" style={{ color: t.dimText }}>
        Alpha/Theta ↑ better · Rel. Alpha ↑ better · Rel. Theta ↓ better · SEF90 ↑ better · Raw ADC units
      </p>
    </div>
  )
}

// ─── A/B Chart ────────────────────────────────────────────────────────────────

const AB_GROUPS = [
  { key: 'whoop', label: 'PPG' },
  { key: 'pison', label: 'EMG' },
  { key: 'eeg',   label: 'EEG' },
]

function ABChart({ t, data }) {
  const [group, setGroup] = useState('whoop')
  if (!data) return <p style={{ color: t.subtext }} className="text-sm">No A/B data.</p>

  const source = data[group] ?? {}
  const chartData = Object.entries(source).map(([key, m]) => ({
    name: m.label,
    Sparring:       m.sparring?.mean ?? null,
    'Non-Sparring': m.non_sparring?.mean ?? null,
    pval:           m.p_value,
    sig:            m.significant,
    insufficient:   m.insufficient_n,
  })).filter(d => d.Sparring != null || d['Non-Sparring'] != null)

  // Pick a representative n for legend
  const firstKey = Object.keys(source)[0]
  const nSpar   = source[firstKey]?.sparring?.n ?? '—'
  const nNospar = source[firstKey]?.non_sparring?.n ?? '—'

  const isEEG = group === 'eeg'

  return (
    <Card t={t} className="space-y-4">
      {/* Group tabs */}
      <div className="flex gap-2">
        {AB_GROUPS.map(g => (
          <button key={g.key} onClick={() => setGroup(g.key)}
            className="text-xs px-3 py-1 rounded-sm transition-all"
            style={{
              background: group === g.key ? t.accent : t.border,
              color: group === g.key ? '#000' : t.subtext,
              fontWeight: group === g.key ? 700 : 400,
            }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: t.subtext }}>
        <span><span style={{ color: t.accent }}>■</span> Sparring (n={nSpar})</span>
        <span><span style={{ color: t.accent2 }}>■</span> Non-sparring (n={nNospar})</span>
        {!isEEG && <span style={{ color: '#facc15' }}>★ p&lt;0.05</span>}
        {isEEG && data.eeg_n_note && (
          <span style={{ color: '#facc15' }}>⚠ {data.eeg_n_note}</span>
        )}
      </div>

      {isEEG
        ? <EEGABSmallMultiples t={t} data={data?.eeg ?? {}} />
        : chartData.length === 0
          ? <p className="text-sm py-8 text-center" style={{ color: t.dimText }}>No data for this group.</p>
          : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                <XAxis dataKey="name" tick={{ fill: t.subtext, fontSize: 11 }} />
                <YAxis tick={{ fill: t.subtext, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 8, fontFamily: t.fontFamily }}
                  labelStyle={{ color: t.text }}
                  formatter={(val, name, props) => {
                    const p = props?.payload
                    const suffix = p?.insufficient ? ' (n too small for test)' : p?.pval != null ? ` (p=${p.pval})` : ''
                    return [`${val?.toFixed(3)}${suffix}`, name]
                  }}
                />
                <Bar dataKey="Sparring" fill={t.accent} radius={[4,4,0,0]} opacity={0.9} />
                <Bar dataKey="Non-Sparring" fill={t.accent2} radius={[4,4,0,0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          )
      }
    </Card>
  )
}

// ─── EEG Pre/Post Delta sub-section (same card format as Readiness/Agility) ──

const EEG_PP_DEFS = [
  { key: 'alpha_theta_ratio', label: 'Alpha/Theta Ratio', higherBetter: true,
    unit: 'Δ in ratio (higher = more alert)',
    fmt: v => v != null ? (v > 0 ? '+' : '') + v.toFixed(3) : '—',
    info: { title: 'Alpha/Theta Ratio Pre→Post Delta', formula: 'Δ = post_α/θ − pre_α/θ (EO epoch)', citation: 'Klimesch (1999) Brain Res Rev — α/θ cognitive performance proxy; negative post-session Δ = neural fatigue' } },
  { key: 'rel_alpha_eo', label: 'Rel. Alpha EO', higherBetter: true,
    unit: 'Δ in relative alpha (positive = more aroused)',
    fmt: v => v != null ? (v > 0 ? '+' : '') + (v*100).toFixed(2) + '%' : '—',
    info: { title: 'Relative Alpha Power Delta', formula: 'Δ = post_rel_α − pre_rel_α (Welch PSD, 8–12 Hz / total)', citation: 'Nunez & Srinivasan (2006) — relative power controls for amplitude drift across sessions' } },
  { key: 'rel_theta_eo', label: 'Rel. Theta EO', higherBetter: false,
    unit: 'Δ in relative theta (negative = less fatigue)',
    fmt: v => v != null ? (v > 0 ? '+' : '') + (v*100).toFixed(2) + '%' : '—',
    info: { title: 'Relative Theta Power Delta', formula: 'Δ = post_rel_θ − pre_rel_θ (4–8 Hz / total)', citation: 'Strangman et al. (2018) Concussion — elevated post-session theta = neural fatigue marker' } },
  { key: 'sef90', label: 'SEF90', higherBetter: true,
    unit: 'Hz Δ (higher = faster brain state)',
    fmt: v => v != null ? (v > 0 ? '+' : '') + v.toFixed(2) + ' Hz' : '—',
    info: { title: 'Spectral Edge Frequency 90 Delta', formula: 'Δ = post_SEF90 − pre_SEF90 (freq below which 90% of power lies)', citation: 'Drummond et al. (1995) Anesthesiology — SEF90 as continuous arousal index' } },
]

function EEGPrePostCards({ t, eegData }) {
  if (!eegData || !Object.keys(eegData).length) return null

  return (
    <>
      {EEG_PP_DEFS.map(({ key, label, higherBetter, unit, fmt, info }) => {
        const d = eegData[key]
        if (!d) return null
        const boxing   = d.boxing?.mean ?? null
        const sparring = d.sparring?.mean ?? null

        const valueColor = (val) => {
          if (val == null) return t.subtext
          const improved = higherBetter ? val > 0 : val < 0
          return improved ? '#4ade80' : '#ef4444'
        }

        const maxAbs = Math.max(Math.abs(boxing ?? 0), Math.abs(sparring ?? 0), 0.001)

        return (
          <Card key={key} t={t}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold flex items-center gap-1">
                {label}<Info {...info} />
              </span>
              <span className="text-xs" style={{ color: t.dimText }}>EEG</span>
            </div>
            <div className="flex gap-6">
              {[
                { label: 'Boxing',   val: boxing,   n: d.boxing?.n },
                { label: 'Sparring', val: sparring, n: d.sparring?.n },
              ].map(item => (
                <div key={item.label} className="flex-1">
                  <p className="text-xs mb-1" style={{ color: t.subtext }}>
                    {item.label}{item.n != null ? ` (n=${item.n})` : ''}
                  </p>
                  <p className="text-2xl font-bold leading-tight" style={{ color: valueColor(item.val) }}>
                    {fmt(item.val)}
                  </p>
                  {item.val != null && (
                    <div className="h-1.5 rounded-full mt-2" style={{ background: t.border }}>
                      <div className="h-1.5 rounded-full" style={{
                        width: `${Math.abs(item.val) / maxAbs * 100}%`,
                        background: valueColor(item.val),
                      }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: t.dimText }}>
              {unit} · Hypothesis: |sparring Δ| &gt; |boxing Δ|
            </p>
          </Card>
        )
      })}
    </>
  )
}

function PrePostChart({ t, data }) {
  if (!data) return <p style={{ color: t.subtext }} className="text-sm">No pre/post data.</p>

  const metrics = [
    { key: 'readiness', label: 'Readiness (ms)', invert: true },
    { key: 'agility',   label: 'Agility (/100)',  invert: false },
  ]

  return (
    <div className="space-y-4">
      {metrics.map(({ key, label, invert }) => {
        const d = data[key]
        if (!d) return null
        const boxing   = d.boxing?.mean ?? 0
        const sparring = d.sparring?.mean ?? 0
        const chartData = [
          { condition: 'Boxing',   delta: boxing,   fill: t.accent2 },
          { condition: 'Sparring', delta: sparring,  fill: '#ef4444' },
        ]
        const sigText = d.p_value != null
          ? `Mann-Whitney U p=${d.p_value}${d.significant ? ' ★' : ''}`
          : null

        return (
          <Card key={key} t={t}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">{label}</span>
              {sigText && (
                <span className="text-xs" style={{ color: d.p_value < 0.05 ? '#facc15' : t.dimText }}>
                  {sigText}
                </span>
              )}
            </div>
            <div className="flex gap-6">
              {chartData.map(item => (
                <div key={item.condition} className="flex-1">
                  <p className="text-xs mb-1" style={{ color: t.subtext }}>{item.condition}</p>
                  <p
                    className="text-3xl font-bold"
                    style={{
                      color: item.delta === 0 ? t.subtext
                        : item.delta > 0 === !invert ? t.accent : '#ef4444'
                    }}
                  >
                    {item.delta > 0 ? '+' : ''}{item.delta?.toFixed(1) ?? '—'}
                  </p>
                  <div className="h-1.5 rounded-full mt-2" style={{ background: t.border }}>
                    <div className="h-1.5 rounded-full" style={{
                      width: `${Math.min(Math.abs(item.delta) / 30 * 100, 100)}%`,
                      background: item.fill,
                      marginLeft: item.delta < 0 ? 'auto' : 0,
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: t.dimText }}>
              {invert ? 'Positive Δ = slower (worse)' : 'Positive Δ = higher score (better)'} ·
              Hypothesis: |sparring Δ| &gt; |boxing Δ|
            </p>
          </Card>
        )
      })}

      {/* EEG pre/post delta — same card format as Readiness/Agility */}
      <EEGPrePostCards t={t} eegData={data.eeg} />
    </div>
  )
}

// ─── Longitudinal Chart ───────────────────────────────────────────────────────

const LONG_METRICS = [
  { key: 'hrv_ms',             label: 'HRV (ms)',            colorKey: 'accent',  group: 'PPG' },
  { key: 'recovery_pct',       label: 'Recovery %',          colorKey: 'accent2', group: 'PPG' },
  { key: 'readiness_ms',       label: 'Readiness (ms)',      colorKey: 'accent3', group: 'EMG' },
  { key: 'agility',            label: 'Agility (/100)',      colorKey: 'accent3', group: 'EMG' },
  { key: 'alpha_theta_ratio',  label: 'Alpha/Theta (EEG)',   colorKey: 'accent',  group: 'EEG' },
  { key: 'sef90',              label: 'SEF90 Hz (EEG)',      colorKey: 'accent2', group: 'EEG' },
]

function LongitudinalChart({ t, data }) {
  const [activeMetric, setActiveMetric] = useState('hrv_ms')
  if (!data?.length) return <p style={{ color: t.subtext }} className="text-sm">No longitudinal data yet.</p>

  const chartData = data.map(d => ({
    week: d.week_start?.slice(5) ?? '',
    ...d,
    contact_label: CONTACT_LABELS[Math.round(d.contact_numeric)] ?? '',
  }))

  const getColor = (key) => {
    const m = LONG_METRICS.find(x => x.key === key)
    if (!m) return t.accent
    if (key === 'agility') return t.accent3
    return t[m.colorKey]
  }

  return (
    <Card t={t} className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {LONG_METRICS.map(m => {
          const color = getColor(m.key)
          const active = activeMetric === m.key
          return (
            <button key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className="text-xs px-3 py-1 rounded-sm transition-all"
              style={{
                background: active ? color : t.border,
                color: active ? '#000' : t.subtext,
                fontWeight: active ? 700 : 400,
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
          <XAxis dataKey="week" tick={{ fill: t.subtext, fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fill: t.subtext, fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 3.5]}
            tick={{ fill: t.dimText, fontSize: 10 }}
            tickFormatter={v => CONTACT_LABELS[Math.round(v)] ?? ''} />
          <Tooltip
            contentStyle={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 8, fontFamily: t.fontFamily }}
            labelStyle={{ color: t.text }}
            formatter={(val, name) => [
              name === 'contact_numeric'
                ? `${CONTACT_LABELS[Math.round(val)] ?? val} (${val?.toFixed(1)})`
                : val?.toFixed(1),
              name === 'contact_numeric' ? 'Head Contact' : name,
            ]}
          />
          <Area yAxisId="right" type="stepAfter" dataKey="contact_numeric"
            fill="#ef444420" stroke="#ef4444" strokeWidth={1.5}
            dot={false} name="contact_numeric" />
          <Line yAxisId="left" type="monotone" dataKey={activeMetric}
            stroke={getColor(activeMetric)} strokeWidth={2.5}
            dot={{ r: 4, fill: getColor(activeMetric) }}
            activeDot={{ r: 6 }} connectNulls name={activeMetric} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex gap-4 text-xs flex-wrap" style={{ color: t.subtext }}>
        <span>
          <span style={{ color: getColor(activeMetric) }}>—</span>{' '}
          {LONG_METRICS.find(m => m.key === activeMetric)?.label} · {LONG_METRICS.find(m => m.key === activeMetric)?.group} (left axis)
        </span>
        <span><span style={{ color: '#ef4444' }}>■</span> Head Contact Score (right axis · None→3 High)</span>
      </div>

      {/* Head contact timeline — color intensity = contact severity */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <p className="text-xs" style={{ color: t.dimText }}>Weekly head contact</p>
          <p className="text-xs" style={{ color: t.dimText, opacity: 0.6 }}>Higher contact weeks typically precede metric suppression (Dashnaw et al., 2012)</p>
        </div>
        {/* Segmented bar — one cell per week, colored by contact level */}
        <div className="flex h-2 mb-1" style={{ gap: '2px' }}>
          {chartData.map((d, i) => {
            const level = CONTACT_LABELS[Math.round(d.contact_numeric)] ?? 'None'
            const color = CONTACT_COLORS[level] ?? '#374151'
            return <div key={i} className="flex-1" style={{ background: color, opacity: level === 'None' ? 0.2 : 0.8 }} />
          })}
        </div>
        {/* Week labels + level text */}
        <div className="flex" style={{ gap: '2px' }}>
          {chartData.map((d, i) => {
            const level = CONTACT_LABELS[Math.round(d.contact_numeric)] ?? 'None'
            const color = CONTACT_COLORS[level] ?? '#6b7280'
            return (
              <div key={i} className="flex-1 flex flex-col items-center pt-1">
                <span style={{ fontSize: '8px', color: level === 'None' ? t.dimText : color, fontWeight: level === 'None' ? 400 : 600 }}>{level}</span>
                <span style={{ fontSize: '8px', color: t.dimText, opacity: 0.6 }}>{d.week}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ─── Neuroprotective Panel ────────────────────────────────────────────────────

const NEURO_METRICS = [
  { key: 'hrv_ms',            label: 'HRV (ms)',           lowerBetter: false, group: 'PPG',
    fmt: v => v?.toFixed(0) },
  { key: 'recovery_pct',      label: 'Recovery %',         lowerBetter: false, group: 'PPG',
    fmt: v => v?.toFixed(0) },
  { key: 'rhr_bpm',           label: 'RHR (bpm)',          lowerBetter: true,  group: 'PPG',
    fmt: v => v?.toFixed(0) },
  { key: 'sleep_perf_pct',    label: 'Sleep %',            lowerBetter: false, group: 'PPG',
    fmt: v => v?.toFixed(0) },
  { key: 'readiness_ms',      label: 'Reaction Time (ms)', lowerBetter: true,  group: 'EMG',
    fmt: v => v?.toFixed(0) },
  { key: 'alpha_theta_ratio', label: 'Alpha/Theta Ratio',  lowerBetter: false, group: 'EEG',
    fmt: v => v?.toFixed(3) },
]

function NeuroprotectivePanel({ t, data }) {
  const [agent, setAgent] = useState('creatine')
  if (!data) return <p style={{ color: t.subtext }} className="text-sm">No neuroprotective data.</p>

  const agentData = data[agent] ?? {}
  const interpretation = buildNeuroInterpretation(data, agent)
  const corr = data.creatine_cumulative_hrv_correlation

  const activeMetrics = NEURO_METRICS.filter(m => agentData[m.key]?.without?.mean != null || agentData[m.key]?.with?.mean != null)

  return (
    <Card t={t} className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2">
        {['caffeine', 'creatine'].map(a => (
          <button key={a} onClick={() => setAgent(a)}
            className="text-xs px-4 py-1.5 rounded-sm capitalize font-medium transition-all"
            style={{ background: agent === a ? t.accent : t.border, color: agent === a ? '#000' : t.subtext }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Interpretation */}
      {interpretation && (
        <div className="pl-3" style={{ borderLeft: `2px solid ${t.border}` }}>
          {interpretation.map((line, i) => (
            <p key={i} className="text-xs leading-relaxed" style={{ color: t.dimText, marginTop: i > 0 ? '0.4rem' : 0 }}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Small multiples — one row per metric, each with its own scale */}
      <div>
        <p className="text-xs mb-3" style={{ color: t.subtext }}>
          Acute effect — same-day metrics with vs without {agent}
        </p>
        <div className="space-y-2">
          {activeMetrics.map(m => {
            const d = agentData[m.key] ?? {}
            const wout = d.without?.mean
            const with_ = d.with?.mean
            if (wout == null && with_ == null) return null
            const maxVal = Math.max(Math.abs(wout ?? 0), Math.abs(with_ ?? 0), 0.001)
            // "better" direction for the "With" bar
            const withBetter = m.lowerBetter ? (with_ < wout) : (with_ > wout)
            const withColor = with_ != null && wout != null ? (withBetter ? t.accent : '#ef4444') : t.accent

            return (
              <div key={m.key} className="rounded p-3" style={{ background: `${t.bg}99`, border: `1px solid ${t.border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: t.subtext }}>{m.label}</span>
                  <span className="text-xs" style={{ color: t.dimText }}>
                    {m.group}
                    {d.significant && <span style={{ color: '#facc15' }}> ★</span>}
                    {d.p_value != null && <span> p={d.p_value}</span>}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: `Without  (n=${d.without?.n ?? '—'})`, val: wout, color: t.border },
                    { label: `With     (n=${d.with?.n ?? '—'})`,    val: with_, color: withColor },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="text-xs w-28 shrink-0" style={{ color: t.dimText }}>{row.label}</span>
                      <div className="flex-1 h-3.5 rounded" style={{ background: t.border }}>
                        <div className="h-3.5 rounded" style={{
                          width: row.val != null ? `${Math.abs(row.val) / maxVal * 100}%` : '0%',
                          background: row.color === t.border ? `${t.subtext}55` : row.color,
                          opacity: 0.9,
                        }} />
                      </div>
                      <span className="text-xs font-semibold w-14 text-right" style={{ color: row.color === t.border ? t.subtext : row.color }}>
                        {row.val != null ? m.fmt(row.val) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs mt-2" style={{ color: t.dimText }}>
          ★ p&lt;0.05 (Mann-Whitney U) · green = better with {agent} · red = worse · EEG n is small — interpret cautiously
        </p>
      </div>

      {/* Cumulative creatine correlation */}
      {agent === 'creatine' && corr && (
        <div className="rounded p-4" style={{ background: `${t.bg}88`, border: `1px solid ${t.border}` }}>
          <p className="text-sm font-semibold mb-2">
            Cumulative Creatine Days → HRV Correlation
            <Info
              title="Cumulative Creatine Analysis"
              formula="r = Pearson(Σcreatine_days, HRV_ms) — longitudinal correlation"
              citation="Rawson & Venezia (2011) Amino Acids — 5g/day creatine monohydrate; neuroprotective via phosphocreatine buffering and mitochondrial membrane stabilization"
            />
          </p>
          <p className="text-2xl font-bold" style={{ color: corr.r > 0 ? t.accent : '#ef4444' }}>
            r = {corr.r}
          </p>
          <p className="text-xs mt-1" style={{ color: t.subtext }}>p = {corr.p_value} · n = {corr.n} days</p>
          <p className="text-xs mt-2" style={{ color: t.dimText }}>{corr.interpretation}</p>
          {corr.r < 0 && (
            <p className="text-xs mt-2" style={{ color: '#facc15' }}>
              ⚠ Confounding likely — creatine was taken predominantly on heavy training days, which also suppresses HRV.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
