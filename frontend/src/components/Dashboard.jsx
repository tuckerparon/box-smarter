import { useState } from 'react'
import { useDashboardData } from '../hooks/useDashboardData'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Area,
} from 'recharts'

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:      '#F7F6F2',
  cardBg:  '#FFFFFF',
  border:  '#E3DFD6',
  accent:  '#B22222',
  accent2: '#1A4A8A',
  accent3: '#2E7D32',
  text:    '#1A1A1A',
  subtext: '#5C5C5C',
  dimText: '#9A9A9A',
  serif:   'Georgia, "Times New Roman", Times, serif',
  sans:    'Inter, system-ui, sans-serif',
}

const CONTACT_LABELS = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' }
const CONTACT_COLORS = { None: '#9A9A9A', Low: '#D4A017', Medium: '#C0622B', High: '#B22222' }
const CONTACT_BG     = { None: 'transparent', Low: 'rgba(212,160,23,0.08)', Medium: 'rgba(192,98,43,0.12)', High: 'rgba(178,34,34,0.15)' }

// ─── Shared primitives ────────────────────────────────────────────────────────

function Info({ title, formula, citation }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle ml-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="rounded-full w-4 h-4 inline-flex items-center justify-center transition-opacity hover:opacity-100"
        style={{ opacity: 0.5, fontSize: '10px', background: '#EEE9E0', color: T.subtext, border: `1px solid ${T.border}` }}
      >
        ⓘ
      </button>
      {open && (
        <div
          className="absolute z-50 left-0 top-6 w-80 shadow-xl p-4 rounded"
          style={{ background: '#FAFAF8', border: `1px solid ${T.border}`, color: T.subtext }}
        >
          {title && <p className="text-sm font-semibold mb-2" style={{ color: T.text, fontFamily: T.serif }}>{title}</p>}
          {formula && (
            <p className="text-xs rounded px-3 py-2 mb-3 leading-relaxed"
              style={{ background: '#F0ECE4', color: T.accent2, fontFamily: 'monospace', border: `1px solid ${T.border}` }}>
              {formula}
            </p>
          )}
          {citation && <p className="text-xs italic leading-relaxed" style={{ color: T.dimText }}>{citation}</p>}
          <button onClick={() => setOpen(false)} className="mt-3 text-xs hover:underline" style={{ color: T.dimText }}>Close</button>
        </div>
      )}
    </span>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded ${className}`} style={{ background: T.cardBg, border: `1px solid ${T.border}` }}>
      {children}
    </div>
  )
}

function Skeleton({ h = 'h-48' }) {
  return <div className={`${h} rounded animate-pulse`} style={{ background: T.border }} />
}

function CohensBadge({ d }) {
  if (d == null) return null
  const abs = Math.abs(d)
  const mag = abs >= 0.8 ? 'large' : abs >= 0.5 ? 'medium' : abs >= 0.2 ? 'small' : 'negligible'
  const color = abs >= 0.5 ? T.accent : abs >= 0.2 ? '#9A4F00' : T.dimText
  return (
    <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
      style={{ background: '#FEF3E2', color, border: '1px solid #F5DEB3', fontFamily: T.sans }}
      title="Cohen's d effect size">
      d={abs.toFixed(2)} ({mag})
    </span>
  )
}

function SectionLabel({ tag, tagColor, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ background: tagColor + '18', color: tagColor, border: `1px solid ${tagColor}40`, fontFamily: T.sans, letterSpacing: '0.06em' }}>
          {tag}
        </span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: T.subtext, fontFamily: T.sans }}>{children}</p>
      <div className="mt-4" style={{ borderBottom: `1px solid ${T.border}` }} />
    </div>
  )
}

function InterpretationBox({ lines }) {
  if (!lines?.length) return null
  return (
    <div className="mt-4 p-4 rounded" style={{ background: '#FAFAF8', border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.border}` }}>
      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: T.dimText, fontFamily: T.sans, letterSpacing: '0.1em' }}>
        What the data shows
      </p>
      {lines.map((line, i) => (
        <p key={i} className="text-xs leading-relaxed" style={{ color: T.subtext, fontFamily: T.sans, marginTop: i > 0 ? '0.5rem' : 0 }}>
          {line}
        </p>
      ))}
    </div>
  )
}

// ─── Metric format helpers ────────────────────────────────────────────────────

const EEG_DEFS = {
  alpha_reactivity: {
    label: 'Alpha Reactivity',
    higherBetter: true,
    fmt: v => {
      if (v == null) return '—'
      const abs = Math.abs(v)
      if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
      if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`
      return v.toFixed(1)
    },
    info: {
      title: 'Alpha Reactivity (EC − EO)',
      formula: 'α_power_EC − α_power_EO  (8–12 Hz, Welch PSD)',
      citation: 'Klimesch (1999) Brain Res Rev — alpha ERD during eye-opening is a marker of cortical arousal; blunted reactivity follows head impact',
    },
  },
  alpha_theta_ratio: {
    label: 'Alpha/Theta Ratio',
    higherBetter: true,
    fmt: v => v != null ? v.toFixed(3) : '—',
    info: {
      title: 'Alpha/Theta Ratio (EO epoch)',
      formula: 'α_power_EO / θ_power_EO  (8–12 Hz / 4–8 Hz)',
      citation: 'Klimesch (1999) — α/θ tracks cognitive performance; decreases with neural fatigue and post-concussive states',
    },
  },
  rel_alpha_eo: {
    label: 'Rel. Alpha EO',
    higherBetter: true,
    fmt: v => v != null ? `${(v * 100).toFixed(1)}%` : '—',
    info: {
      title: 'Relative Alpha Power (EO)',
      formula: 'α_EO / Σband_power_EO  (normalized to 1–45 Hz total)',
      citation: 'Nunez & Srinivasan (2006) — relative power controls for session-to-session amplitude drift',
    },
  },
  rel_theta_eo: {
    label: 'Rel. Theta EO',
    higherBetter: false,
    fmt: v => v != null ? `${(v * 100).toFixed(1)}%` : '—',
    info: {
      title: 'Relative Theta Power (EO)',
      formula: 'θ_EO / Σband_power_EO  (normalized to 1–45 Hz total)',
      citation: 'Slobounov et al. (2010) J Neural Eng — elevated theta EO is a sub-concussive fatigue marker',
    },
  },
}

// ─── Key Findings ─────────────────────────────────────────────────────────────

function KeyFindings({ data }) {
  if (!data) return null
  const findings = []

  const atr = data.abSparring?.eeg?.alpha_theta_ratio
  if (atr?.sparring?.mean != null && atr?.non_sparring?.mean != null) {
    const diff = atr.sparring.mean - atr.non_sparring.mean
    findings.push({
      label: 'Alpha/theta ratio — sparring vs non-sparring',
      value: `${diff >= 0 ? '+' : ''}${diff.toFixed(3)}`,
      detail: diff < 0 ? 'Lower EEG arousal index on contact days' : 'Higher EEG arousal index on contact days',
      color: T.accent2,
      sig: atr.sparring?.p_value != null && atr.sparring.p_value < 0.05,
    })
  }

  const ar = data.abSparring?.eeg?.alpha_reactivity
  if (ar?.sparring?.mean != null && ar?.non_sparring?.mean != null) {
    const diff = ar.sparring.mean - ar.non_sparring.mean
    findings.push({
      label: 'Alpha reactivity — sparring vs non-sparring',
      value: EEG_DEFS.alpha_reactivity.fmt(diff),
      detail: diff < 0 ? 'Blunted arousal response on sparring days (supports H1)' : 'No reactivity suppression on sparring days',
      color: diff < 0 ? T.accent : T.accent3,
      sig: ar.sparring?.p_value != null && ar.sparring.p_value < 0.05,
    })
  }

  const rt = data.abSparring?.pison?.readiness_ms
  if (rt?.sparring?.mean != null && rt?.non_sparring?.mean != null) {
    const diff = rt.sparring.mean - rt.non_sparring.mean
    findings.push({
      label: 'Reaction time — sparring vs non-sparring',
      value: `${diff >= 0 ? '+' : ''}${diff.toFixed(0)} ms`,
      detail: diff > 0 ? 'Slower on contact days (greater neuromuscular cost)' : 'No reaction time difference on contact days',
      color: diff > 0 ? T.accent : T.accent3,
      sig: rt.sparring?.p_value != null && rt.sparring.p_value < 0.05,
    })
  }

  if (!findings.length) return null

  return (
    <Card className="p-5 mb-10">
      <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: T.dimText, fontFamily: T.sans, letterSpacing: '0.1em' }}>
        Key Findings
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {findings.map((f, i) => (
          <div key={i} className="p-3 rounded"
            style={{ background: T.bg, border: `1px solid ${T.border}`, borderLeft: `3px solid ${f.color}` }}>
            <p className="text-xs mb-1" style={{ color: T.dimText, fontFamily: T.sans }}>
              {f.label}
              {f.sig && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold"
                  style={{ background: '#FEF3E2', color: '#9A4F00', fontFamily: T.sans, fontSize: '0.6rem' }}>
                  p&lt;0.05
                </span>
              )}
            </p>
            <p className="text-2xl font-bold leading-none mb-1" style={{ color: f.color, fontFamily: T.serif }}>{f.value}</p>
            <p className="text-xs" style={{ color: T.subtext, fontFamily: T.sans }}>{f.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Interpretation builders ──────────────────────────────────────────────────

function buildH1Interpretation(data) {
  if (!data) return null
  const lines = []

  const ar = data.eeg?.alpha_reactivity
  if (ar?.sparring?.mean != null && ar?.non_sparring?.mean != null) {
    const sp = ar.sparring.mean, ns = ar.non_sparring.mean
    const dir = sp < ns ? 'lower' : 'higher'
    const pStr = ar.sparring?.p_value != null ? ` (p = ${ar.sparring.p_value})` : ''
    lines.push(
      `Alpha reactivity was ${dir} on sparring days (${EEG_DEFS.alpha_reactivity.fmt(sp)} vs ${EEG_DEFS.alpha_reactivity.fmt(ns)})${pStr} — ${sp < ns ? 'blunted arousal response consistent with H1' : 'no suppression observed'}.`
    )
  }

  const atr = data.eeg?.alpha_theta_ratio
  if (atr?.sparring?.mean != null && atr?.non_sparring?.mean != null) {
    const sp = atr.sparring.mean, ns = atr.non_sparring.mean
    const dir = sp < ns ? 'lower' : 'higher'
    const d = atr.sparring?.cohens_d
    lines.push(
      `Alpha/theta ratio (EEG) was ${dir} on sparring days (${sp.toFixed(3)} vs ${ns.toFixed(3)})${d != null ? `, Cohen's d = ${Math.abs(d).toFixed(2)}` : ''} — ${sp < ns ? 'reduced cognitive readiness index on contact days (Klimesch, 1999)' : 'no reduction in cognitive readiness index'}.`
    )
  }

  const rt = data.pison?.readiness_ms
  if (rt?.sparring?.mean != null && rt?.non_sparring?.mean != null) {
    const sp = rt.sparring.mean, ns = rt.non_sparring.mean
    const dir = sp > ns ? 'slower' : 'faster'
    const d = rt.sparring?.cohens_d
    lines.push(
      `Reaction time (ENG) was ${dir} on sparring days (${sp.toFixed(0)} ms vs ${ns.toFixed(0)} ms)${d != null ? `, d = ${Math.abs(d).toFixed(2)}` : ''} — ${sp > ns ? 'elevated neuromuscular cost on contact days' : 'no reaction time difference by session type'}.`
    )
  }

  if (!lines.length) return null
  const allSupport = lines.every(l => l.includes('consistent with H1') || l.includes('reduced') || l.includes('elevated neuromuscular'))
  lines.push(allSupport
    ? 'Overall: early evidence supports H1 — contact sessions produce measurable suppression across both EEG and ENG domains. Statistical confidence is limited by small n; interpret directionally.'
    : 'Overall: findings are mixed. Continue collecting sessions to reach adequate statistical power.'
  )
  return lines
}

function buildRQ1Interpretation(data) {
  if (!data?.length || data.length < 2) return null
  const lines = []
  const first = data[0], last = data[data.length - 1]

  if (first.alpha_theta_ratio != null && last.alpha_theta_ratio != null) {
    const delta = last.alpha_theta_ratio - first.alpha_theta_ratio
    lines.push(
      `Alpha/theta ratio has ${delta > 0 ? 'increased' : 'decreased'} from ${first.alpha_theta_ratio.toFixed(3)} to ${last.alpha_theta_ratio.toFixed(3)} over the camp — ${delta > 0 ? 'trending toward better cognitive readiness' : 'trending toward cumulative neural fatigue'}.`
    )
  }

  if (first.alpha_reactivity != null && last.alpha_reactivity != null) {
    const delta = last.alpha_reactivity - first.alpha_reactivity
    lines.push(
      `Alpha reactivity has ${delta > 0 ? 'improved' : 'declined'} (${EEG_DEFS.alpha_reactivity.fmt(first.alpha_reactivity)} → ${EEG_DEFS.alpha_reactivity.fmt(last.alpha_reactivity)}) — ${delta > 0 ? 'cortical arousal response strengthening over camp' : 'possible cumulative suppression of arousal response'}.`
    )
  }

  if (first.readiness_ms != null && last.readiness_ms != null) {
    const delta = last.readiness_ms - first.readiness_ms
    lines.push(
      `Reaction time has ${delta > 0 ? 'slowed' : 'improved'} by ${Math.abs(delta).toFixed(0)} ms since camp start — ${delta > 0 ? 'neuromuscular fatigue accumulating' : 'neuromuscular adaptation over training camp'}.`
    )
  }

  return lines.length ? lines : null
}

function buildRQ2Interpretation(data) {
  if (!data?.matrix) return null
  const { var_keys, var_labels, matrix } = data

  const hcIdx = var_keys.indexOf('head_contact')
  if (hcIdx === -1) return null

  const lines = []
  const hcRow = matrix[hcIdx]

  const significant = var_keys
    .map((k, i) => ({ key: k, label: var_labels[i], cell: hcRow[i] }))
    .filter(x => x.key !== 'head_contact' && x.cell?.p_value != null && x.cell.p_value < 0.05)
    .sort((a, b) => Math.abs(b.cell.rho) - Math.abs(a.cell.rho))

  if (significant.length > 0) {
    significant.forEach(({ label, cell }) => {
      const dir = cell.rho > 0 ? 'increases' : 'decreases'
      lines.push(`${label} ${dir} significantly with head contact (ρ = ${cell.rho.toFixed(2)}, p = ${cell.p_value.toFixed(3)}, n = ${cell.n}).`)
    })
  } else {
    const strongest = var_keys
      .map((k, i) => ({ key: k, label: var_labels[i], cell: hcRow[i] }))
      .filter(x => x.key !== 'head_contact' && x.cell?.rho != null)
      .sort((a, b) => Math.abs(b.cell.rho) - Math.abs(a.cell.rho))[0]

    if (strongest) {
      lines.push(
        `No statistically significant correlations with head contact were found (strongest: ${strongest.label}, ρ = ${strongest.cell.rho.toFixed(2)}, p = ${strongest.cell.p_value?.toFixed(3) ?? '—'}) — likely reflecting limited statistical power at current n.`
      )
    }
  }

  // EEG ↔ ENG cross-modal
  const engKeys = ['readiness_ms', 'agility']
  const eegKeys = ['alpha_reactivity', 'alpha_theta_ratio', 'rel_alpha_eo', 'rel_theta_eo']
  let strongestCrossModal = null
  engKeys.forEach(ek => {
    eegKeys.forEach(eeKey => {
      const ei = var_keys.indexOf(ek)
      const eei = var_keys.indexOf(eeKey)
      if (ei === -1 || eei === -1) return
      const cell = matrix[ei][eei]
      if (cell?.rho != null && (strongestCrossModal == null || Math.abs(cell.rho) > Math.abs(strongestCrossModal.rho))) {
        strongestCrossModal = { ...cell, engLabel: var_labels[ei], eegLabel: var_labels[eei] }
      }
    })
  })
  if (strongestCrossModal) {
    lines.push(
      `Strongest ENG↔EEG correlation: ${strongestCrossModal.engLabel} × ${strongestCrossModal.eegLabel} (ρ = ${strongestCrossModal.rho.toFixed(2)}${strongestCrossModal.p_value < 0.05 ? ', p<0.05' : ''}) — ${Math.abs(strongestCrossModal.rho) > 0.3 ? 'suggests neuromuscular and EEG measures share a common neurological driver' : 'weak cross-modal coupling at this sample size'}.`
    )
  }

  return lines.length ? lines : null
}

// ─── H1: Metric row (small multiple) ─────────────────────────────────────────

function MetricRow({ metricKey, sparring, nonSparring }) {
  const def = EEG_DEFS[metricKey]
  if (!def) return null
  const sp  = sparring?.mean
  const ns  = nonSparring?.mean
  if (sp == null && ns == null) return null
  const maxVal = Math.max(Math.abs(sp ?? 0), Math.abs(ns ?? 0), 0.001)

  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold flex items-center" style={{ color: T.subtext, fontFamily: T.sans }}>
          {def.label}
          <Info {...def.info} />
          {sparring?.insufficient_n && <span className="ml-2 font-normal" style={{ color: '#9A4F00' }}>⚠ small n</span>}
        </span>
        {sparring?.cohens_d != null && <CohensBadge d={sparring.cohens_d} />}
      </div>
      {[
        { label: 'Sparring',     val: sp,  color: T.accent,  n: sparring?.n },
        { label: 'Non-Sparring', val: ns,  color: T.accent2, n: nonSparring?.n },
      ].map(row => (
        <div key={row.label} className="flex items-center gap-3 mb-1.5">
          <span className="text-xs w-28 shrink-0" style={{ color: T.dimText, fontFamily: T.sans }}>
            {row.label}{row.n != null ? ` (n=${row.n})` : ''}
          </span>
          <div className="flex-1 h-4 rounded" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
            <div className="h-4 rounded transition-all"
              style={{ width: row.val != null ? `${Math.abs(row.val) / maxVal * 100}%` : '0%', background: row.color, opacity: 0.8 }} />
          </div>
          <span className="text-xs font-semibold w-16 text-right" style={{ color: row.color, fontFamily: T.sans }}>
            {def.fmt(row.val)}
          </span>
        </div>
      ))}
      {sparring?.p_value != null && (
        <p className="text-xs mt-1" style={{ color: sparring.p_value < 0.05 ? '#9A4F00' : T.dimText, fontFamily: T.sans }}>
          Mann-Whitney U p = {sparring.p_value}{sparring.significant ? ' ★' : ''}
          {def.higherBetter ? ' · higher = better' : ' · lower = better'}
        </p>
      )}
    </div>
  )
}

function ENGRow({ label, sparring, nonSparring, lowerBetter, fmt, pValue, cohensD, significant }) {
  const sp  = sparring?.mean
  const ns  = nonSparring?.mean
  if (sp == null && ns == null) return null
  const maxVal = Math.max(Math.abs(sp ?? 0), Math.abs(ns ?? 0), 0.001)

  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: T.subtext, fontFamily: T.sans }}>{label}</span>
        {cohensD != null && <CohensBadge d={cohensD} />}
      </div>
      {[
        { label: 'Sparring',     val: sp, color: T.accent,  n: sparring?.n },
        { label: 'Non-Sparring', val: ns, color: T.accent2, n: nonSparring?.n },
      ].map(row => (
        <div key={row.label} className="flex items-center gap-3 mb-1.5">
          <span className="text-xs w-28 shrink-0" style={{ color: T.dimText, fontFamily: T.sans }}>
            {row.label}{row.n != null ? ` (n=${row.n})` : ''}
          </span>
          <div className="flex-1 h-4 rounded" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
            <div className="h-4 rounded transition-all"
              style={{ width: row.val != null ? `${Math.abs(row.val) / maxVal * 100}%` : '0%', background: row.color, opacity: 0.8 }} />
          </div>
          <span className="text-xs font-semibold w-16 text-right" style={{ color: row.color, fontFamily: T.sans }}>
            {fmt ? fmt(row.val) : row.val?.toFixed(1) ?? '—'}
          </span>
        </div>
      ))}
      {pValue != null && (
        <p className="text-xs mt-1" style={{ color: pValue < 0.05 ? '#9A4F00' : T.dimText, fontFamily: T.sans }}>
          Mann-Whitney U p = {pValue}{significant ? ' ★' : ''}
          {lowerBetter ? ' · lower = faster (better)' : ' · higher = better'}
        </p>
      )}
    </div>
  )
}

// ─── H1: Side-by-side ENG + EEG cards ────────────────────────────────────────

function H1Charts({ data }) {
  if (!data) return <Skeleton />

  const eeg = data.eeg ?? {}
  const pison = data.pison ?? {}

  const hasEEG = Object.keys(eeg).some(k => eeg[k]?.sparring?.mean != null)
  const hasENG = Object.keys(pison).some(k => pison[k]?.sparring?.mean != null)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* ENG */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.accent3, fontFamily: T.sans, letterSpacing: '0.08em' }}>
            ENG — Pison
          </h3>
          <span className="text-xs" style={{ color: T.dimText, fontFamily: T.sans }}>Neuromuscular</span>
        </div>
        <p className="text-xs mb-3" style={{ color: T.dimText, fontFamily: T.sans }}>
          Sparring vs non-sparring · Mann-Whitney U
        </p>
        {!hasENG
          ? <p className="text-xs py-6 text-center" style={{ color: T.dimText, fontFamily: T.sans }}>No Pison data yet.</p>
          : (
            <>
              {pison.readiness_ms && (
                <ENGRow
                  label="Readiness (reaction time)"
                  sparring={pison.readiness_ms.sparring}
                  nonSparring={pison.readiness_ms.non_sparring}
                  lowerBetter
                  fmt={v => v != null ? `${v.toFixed(0)} ms` : '—'}
                  pValue={pison.readiness_ms.p_value}
                  cohensD={pison.readiness_ms.sparring?.cohens_d}
                  significant={pison.readiness_ms.significant}
                />
              )}
              {pison.agility && (
                <ENGRow
                  label="Agility (go/no-go score)"
                  sparring={pison.agility.sparring}
                  nonSparring={pison.agility.non_sparring}
                  lowerBetter={false}
                  fmt={v => v != null ? v.toFixed(1) : '—'}
                  pValue={pison.agility.p_value}
                  cohensD={pison.agility.sparring?.cohens_d}
                  significant={pison.agility.significant}
                />
              )}
            </>
          )
        }
        {data.eeg_n_note && (
          <p className="text-xs mt-3" style={{ color: '#9A4F00', fontFamily: T.sans }}>⚠ {data.eeg_n_note}</p>
        )}
      </Card>

      {/* EEG */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.accent2, fontFamily: T.sans, letterSpacing: '0.08em' }}>
            EEG — Neurable MW75
          </h3>
          <span className="text-xs" style={{ color: T.dimText, fontFamily: T.sans }}>Cortical</span>
        </div>
        <p className="text-xs mb-3" style={{ color: T.dimText, fontFamily: T.sans }}>
          Sparring vs non-sparring · Mann-Whitney U
        </p>
        {!hasEEG
          ? <p className="text-xs py-6 text-center" style={{ color: T.dimText, fontFamily: T.sans }}>No EEG data yet.</p>
          : ['alpha_reactivity', 'alpha_theta_ratio', 'rel_alpha_eo', 'rel_theta_eo'].map(k => (
              eeg[k] ? (
                <MetricRow
                  key={k}
                  metricKey={k}
                  sparring={eeg[k].sparring}
                  nonSparring={eeg[k].non_sparring}
                />
              ) : null
            ))
        }
      </Card>
    </div>
  )
}

// ─── RQ1: Longitudinal chart ──────────────────────────────────────────────────

const LONG_METRICS = [
  { key: 'readiness_ms',      label: 'Readiness (ms)',    color: T.accent,  group: 'ENG', inverted: true },
  { key: 'agility',           label: 'Agility (/100)',    color: T.accent3, group: 'ENG', inverted: false },
  { key: 'alpha_reactivity',  label: 'Alpha Reactivity',  color: T.accent2, group: 'EEG', inverted: false },
  { key: 'alpha_theta_ratio', label: 'Alpha/Theta',       color: T.accent2, group: 'EEG', inverted: false },
  { key: 'rel_alpha_eo',      label: 'Rel. Alpha EO',     color: '#5C9E7A', group: 'EEG', inverted: false },
  { key: 'rel_theta_eo',      label: 'Rel. Theta EO',     color: '#9A4F00', group: 'EEG', inverted: true },
]

function LongitudinalChart({ data }) {
  const [activeKey, setActiveKey] = useState('alpha_theta_ratio')

  if (!data?.length) return <p style={{ color: T.subtext, fontFamily: T.sans }} className="text-sm">No longitudinal data yet.</p>

  const activeDef = LONG_METRICS.find(m => m.key === activeKey)

  const chartData = data.map(d => ({
    week: d.week_start?.slice(5) ?? '',
    contact_label: CONTACT_LABELS[Math.round(d.contact_numeric)] ?? 'None',
    contact_numeric: d.contact_numeric,
    ...d,
  }))

  const fmtVal = v => {
    if (v == null) return '—'
    if (activeKey === 'alpha_reactivity') return EEG_DEFS.alpha_reactivity.fmt(v)
    if (activeKey.startsWith('rel_')) return `${(v * 100).toFixed(1)}%`
    return v.toFixed(activeKey.includes('ratio') ? 3 : 1)
  }

  return (
    <Card className="p-5 space-y-4">
      {/* Metric toggle */}
      <div>
        {['ENG', 'EEG'].map(group => (
          <div key={group} className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold w-8" style={{ color: T.dimText, fontFamily: T.sans }}>{group}</span>
            {LONG_METRICS.filter(m => m.group === group).map(m => (
              <button key={m.key} onClick={() => setActiveKey(m.key)}
                className="text-xs px-3 py-1 rounded transition-all"
                style={{
                  background: activeKey === m.key ? m.color : T.bg,
                  color: activeKey === m.key ? '#fff' : T.subtext,
                  border: `1px solid ${activeKey === m.key ? m.color : T.border}`,
                  fontFamily: T.sans,
                  fontWeight: activeKey === m.key ? 600 : 400,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Line chart */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="week" tick={{ fill: T.subtext, fontSize: 11, fontFamily: T.sans }} />
          <YAxis yAxisId="main" tick={{ fill: T.subtext, fontSize: 11, fontFamily: T.sans }}
            tickFormatter={v => fmtVal(v)} />
          <YAxis yAxisId="contact" orientation="right" domain={[0, 3.5]}
            tick={{ fill: T.dimText, fontSize: 9, fontFamily: T.sans }}
            tickFormatter={v => CONTACT_LABELS[Math.round(v)] ?? ''} />
          <Tooltip
            contentStyle={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 4, fontFamily: T.sans }}
            labelStyle={{ color: T.text }}
            formatter={(val, name) => {
              if (name === 'contact_numeric') return [`${CONTACT_LABELS[Math.round(val)] ?? val}`, 'Head Contact']
              return [fmtVal(val), activeDef?.label ?? name]
            }}
          />
          <Area yAxisId="contact" type="stepAfter" dataKey="contact_numeric"
            fill={`${T.accent}14`} stroke={`${T.accent}60`} strokeWidth={1}
            dot={false} name="contact_numeric" />
          <Line yAxisId="main" type="monotone" dataKey={activeKey}
            stroke={activeDef?.color ?? T.accent2} strokeWidth={2.5}
            dot={{ r: 4, fill: activeDef?.color ?? T.accent2 }}
            activeDot={{ r: 6 }} connectNulls name={activeKey} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-5 text-xs flex-wrap" style={{ color: T.subtext, fontFamily: T.sans }}>
        <span>
          <span style={{ color: activeDef?.color }}>—</span>{' '}
          {activeDef?.label}
          {activeDef?.inverted ? ' (lower = better)' : ' (higher = better)'}
        </span>
        <span><span style={{ color: T.accent, opacity: 0.6 }}>■</span> Head Contact (right axis)</span>
      </div>

      {/* Contact timeline strip */}
      <div>
        <p className="text-xs mb-2" style={{ color: T.dimText, fontFamily: T.sans }}>Weekly head contact score</p>
        <div className="flex h-2 mb-1" style={{ gap: '2px' }}>
          {chartData.map((d, i) => {
            const level = CONTACT_LABELS[Math.round(d.contact_numeric)] ?? 'None'
            return <div key={i} className="flex-1" style={{ background: CONTACT_COLORS[level] ?? T.dimText, opacity: level === 'None' ? 0.2 : 0.75 }} />
          })}
        </div>
        <div className="flex" style={{ gap: '2px' }}>
          {chartData.map((d, i) => {
            const level = CONTACT_LABELS[Math.round(d.contact_numeric)] ?? 'None'
            return (
              <div key={i} className="flex-1 flex flex-col items-center pt-1">
                <span style={{ fontSize: '8px', color: level === 'None' ? T.dimText : CONTACT_COLORS[level], fontWeight: level === 'None' ? 400 : 600, fontFamily: T.sans }}>{level}</span>
                <span style={{ fontSize: '8px', color: T.dimText, opacity: 0.6, fontFamily: T.sans }}>{d.week}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ─── RQ2: Correlation matrix ──────────────────────────────────────────────────

function corrColor(rho) {
  if (rho == null) return '#E8E4DC'
  if (Math.abs(rho) > 0.999) return '#EEE9E0'
  const t = (rho + 1) / 2
  if (t > 0.5) {
    const i = (t - 0.5) * 2
    return `rgba(26, 74, 138, ${i * 0.7})`
  }
  const i = (0.5 - t) * 2
  return `rgba(178, 34, 34, ${i * 0.7})`
}

function corrTextColor(rho) {
  if (rho == null) return T.dimText
  if (Math.abs(rho) > 0.999) return T.subtext
  return Math.abs(rho) > 0.45 ? '#fff' : T.text
}

function CorrelationMatrix({ data }) {
  const [tooltip, setTooltip] = useState(null)

  if (!data?.matrix?.length) {
    return <p style={{ color: T.subtext, fontFamily: T.sans }} className="text-sm">No correlation data yet.</p>
  }

  const { var_keys, var_labels, matrix } = data
  const n = var_keys.length
  const CELL_SIZE = 68
  const LABEL_W = 100

  const cells = []

  // Top-left empty
  cells.push(<div key="tl" />)

  // Column headers
  var_labels.forEach((l, j) => (
    cells.push(
      <div key={`ch-${j}`} style={{
        fontSize: '9px', color: T.subtext, fontFamily: T.sans, textAlign: 'center',
        padding: '4px 2px', lineHeight: 1.3, fontWeight: 600, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center', height: '48px',
      }}>
        {l}
      </div>
    )
  ))

  // Rows
  matrix.forEach((row, i) => {
    cells.push(
      <div key={`rh-${i}`} style={{
        fontSize: '9px', color: T.subtext, fontFamily: T.sans, fontWeight: 600,
        display: 'flex', alignItems: 'center', paddingRight: '8px', lineHeight: 1.3,
        height: `${CELL_SIZE}px`,
      }}>
        {var_labels[i]}
      </div>
    )

    row.forEach((cell, j) => {
      const isDiag = i === j
      cells.push(
        <div
          key={`c-${i}-${j}`}
          onMouseEnter={e => setTooltip({ i, j, cell, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTooltip(null)}
          style={{
            background: isDiag ? '#EEE9E0' : corrColor(cell?.rho),
            borderRadius: '3px',
            height: `${CELL_SIZE}px`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDiag ? 'default' : 'crosshair',
            border: `1px solid ${T.border}`,
            gap: '2px',
          }}
        >
          <span style={{
            fontSize: '12px', fontWeight: 700,
            color: isDiag ? T.subtext : corrTextColor(cell?.rho),
            fontFamily: T.sans,
          }}>
            {cell?.rho != null ? cell.rho.toFixed(2) : '—'}
          </span>
          {!isDiag && cell?.p_value != null && cell.p_value < 0.05 && (
            <span style={{ fontSize: '9px', color: isDiag ? T.dimText : corrTextColor(cell?.rho), opacity: 0.85, fontFamily: T.sans }}>
              ★
            </span>
          )}
        </div>
      )
    })
  })

  return (
    <Card className="p-5">
      <div style={{ overflowX: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_W}px repeat(${n}, ${CELL_SIZE}px)`,
          gap: '3px',
          width: 'fit-content',
        }}>
          {cells}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-5 text-xs" style={{ color: T.dimText, fontFamily: T.sans }}>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 40, height: 10, borderRadius: 2, background: 'linear-gradient(to right, rgba(178,34,34,0.7), #EEE9E0, rgba(26,74,138,0.7))' }} />
          <span>−1 → 0 → +1</span>
        </div>
        <span>★ p&lt;0.05</span>
        <span>Test: Spearman ρ (all pairs)</span>
        <span style={{ color: '#9A9A9A' }}>Hover cell for details</span>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 14,
          top: tooltip.y - 8,
          background: T.cardBg,
          border: `1px solid ${T.border}`,
          borderRadius: '4px',
          padding: '10px 12px',
          fontFamily: T.sans,
          fontSize: '11px',
          color: T.text,
          zIndex: 1000,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          minWidth: '180px',
        }}>
          <p style={{ fontWeight: 700, marginBottom: '6px', color: T.text }}>
            {var_labels[tooltip.i]} × {var_labels[tooltip.j]}
          </p>
          <p style={{ color: T.subtext, marginBottom: '2px' }}>Test: {tooltip.cell?.test ?? 'Spearman ρ'}</p>
          <p style={{ color: T.subtext, marginBottom: '2px' }}>
            ρ = <strong>{tooltip.cell?.rho?.toFixed(3) ?? '—'}</strong>
          </p>
          {tooltip.cell?.p_value != null && (
            <p style={{ color: tooltip.cell.p_value < 0.05 ? '#9A4F00' : T.subtext, marginBottom: '2px' }}>
              p = {tooltip.cell.p_value.toFixed(4)}{tooltip.cell.p_value < 0.05 ? ' ★' : ''}
            </p>
          )}
          <p style={{ color: T.dimText }}>n = {tooltip.cell?.n ?? '—'}</p>
          {tooltip.cell?.rho == null && <p style={{ color: '#9A4F00', marginTop: '4px' }}>Insufficient data (n&lt;5)</p>}
        </div>
      )}
    </Card>
  )
}

// ─── Metric Glossary (footer) ─────────────────────────────────────────────────

const GLOSSARY = [
  {
    metric: 'Alpha Reactivity',
    proxy: 'Cortical arousal response',
    formula: 'α_EC − α_EO (8–12 Hz)',
    direction: 'Higher = stronger suppression = more aroused',
    citation: 'Klimesch (1999) Brain Res Rev; Oakes et al. (2017) NeuroImage: Clinical',
  },
  {
    metric: 'Alpha/Theta Ratio',
    proxy: 'Cognitive readiness index',
    formula: 'α_EO / θ_EO (8–12 Hz / 4–8 Hz)',
    direction: 'Higher = more alert and cognitively ready',
    citation: 'Klimesch (1999); Strangman et al. (2018) Concussion',
  },
  {
    metric: 'Rel. Alpha EO',
    proxy: 'Arousal state (session-normalized)',
    formula: 'α_EO / Σband_power_EO (1–45 Hz)',
    direction: 'Higher = greater proportion of power in arousal band',
    citation: 'Nunez & Srinivasan (2006) Electric Fields of the Brain',
  },
  {
    metric: 'Rel. Theta EO',
    proxy: 'Cognitive load / neural fatigue',
    formula: 'θ_EO / Σband_power_EO (1–45 Hz)',
    direction: 'Lower = less fatigue signature in EEG',
    citation: 'Slobounov et al. (2010) J Neural Eng; Guskiewicz et al. (2003) JAMA',
  },
  {
    metric: 'Readiness (ms)',
    proxy: 'Neuromuscular reaction speed',
    formula: 'Pison EMG-based reaction time (wrist)',
    direction: 'Lower = faster response = better neuromuscular state',
    citation: 'Strangman et al. (2018) Concussion; Pison Technology (2023)',
  },
  {
    metric: 'Agility (/100)',
    proxy: 'Motor inhibition / go-no-go control',
    formula: 'Pison composite go/no-go accuracy score',
    direction: 'Higher = better motor control and decision speed',
    citation: 'Pison Technology (2023); Greenwald et al. (2008) J Head Trauma Rehabil',
  },
]

function MetricGlossary() {
  return (
    <footer className="pt-8 mt-6" style={{ borderTop: `1px solid ${T.border}` }}>
      <p className="text-xs uppercase tracking-widest mb-5" style={{ color: T.dimText, fontFamily: T.sans, letterSpacing: '0.1em' }}>
        Metric Glossary
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        {GLOSSARY.map(g => (
          <div key={g.metric} className="flex gap-3">
            <div className="mt-0.5 shrink-0 w-1 rounded-full" style={{ background: T.border, minHeight: '16px' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: T.subtext, fontFamily: T.sans }}>{g.metric}</p>
              <p className="text-xs" style={{ color: T.dimText, fontFamily: T.sans }}>
                Proxy for: <span style={{ color: T.subtext }}>{g.proxy}</span>
              </p>
              <p className="text-xs" style={{ color: T.dimText, fontFamily: 'monospace' }}>{g.formula}</p>
              <p className="text-xs" style={{ color: T.dimText, fontFamily: T.sans }}>{g.direction}</p>
              <p className="text-xs italic mt-0.5" style={{ color: '#AEAEAE', fontFamily: T.sans }}>{g.citation}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 pt-4 flex items-center justify-between flex-wrap gap-2 text-xs" style={{ borderTop: `1px solid ${T.border}`, color: T.dimText, fontFamily: T.sans }}>
        <span>
          Statistics: Spearman ρ (correlation), Mann-Whitney U (group comparison), 90% bootstrap CI ·
          EEG: MNE-Python multitaper PSD, bandpass 1–100 Hz, per-channel z-score artifact rejection
        </span>
        <a href="/privacy" style={{ color: T.dimText }} className="hover:underline">Privacy Policy</a>
      </div>
    </footer>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data, loading, error } = useDashboardData()

  if (error) return (
    <div style={{ background: T.bg }} className="min-h-screen flex items-center justify-center">
      <p style={{ color: T.subtext, fontFamily: T.sans }}>Could not load data. Check that the API is reachable.</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.text }}>
      <div className="max-w-4xl mx-auto px-5 py-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="pb-6 mb-8" style={{ borderBottom: `2px solid ${T.border}` }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 style={{ fontFamily: T.serif, fontSize: '1.5rem', fontWeight: 700, color: T.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                Neurological Monitoring During a Boxing Training Camp
              </h1>
              <p className="text-sm mt-2" style={{ color: T.subtext, fontFamily: T.sans }}>
                Tucker Paron &nbsp;·&nbsp; Jan 15 – May 7, 2026 &nbsp;·&nbsp; Rock 'N Rumble XV Boston
              </p>
              <p className="text-xs mt-1" style={{ color: T.dimText, fontFamily: T.sans }}>
                EEG (Neurable MW75) · ENG (Pison) · Daily Survey · n=1 longitudinal, single-subject
              </p>
            </div>
            <a
              href="https://haymakersforhope.org/events/boxing/rock-n-rumble-xv-boston-2026/fighters/tucker-paron"
              target="_blank" rel="noopener noreferrer"
              className="shrink-0 text-xs font-semibold px-4 py-2 rounded transition-opacity hover:opacity-80"
              style={{ background: T.accent, color: '#fff', fontFamily: T.sans }}
            >
              Donate to Haymakers for Hope
            </a>
          </div>
        </header>

        {/* ── Key Findings ────────────────────────────────────────────────── */}
        {!loading && <KeyFindings data={data} />}

        {/* ── H1 ──────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <SectionLabel tag="H1" tagColor={T.accent}>
            Sparring sessions will produce greater acute biomarker suppression than non-contact training
            sessions, across both EEG (alpha/theta ratio) and ENG (reaction time), measured within
            30 minutes pre- and post-session.
          </SectionLabel>

          <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: T.serif, color: T.text }}>
            Sparring vs Non-Sparring Days
            <Info
              title="A/B Analysis: Sparring vs Non-Sparring"
              formula="Mann-Whitney U (non-parametric; appropriate for n<30)\nCohen's d = (μ₁ − μ₂) / √((σ₁² + σ₂²) / 2)"
              citation="Coutts et al. (2007) EJAP; bars show 90% bootstrap CI"
            />
          </h2>

          {loading ? <Skeleton h="h-80" /> : <H1Charts data={data?.abSparring} />}

          {!loading && (
            <InterpretationBox lines={buildH1Interpretation(data?.abSparring)} />
          )}
        </section>

        {/* ── RQ1 ─────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <SectionLabel tag="RQ1" tagColor={T.accent2}>
            How do EEG and neuromuscular biomarkers evolve over the course of a 4-month boxing training
            camp — and is there evidence of cumulative neurological load or adaptation?
          </SectionLabel>

          <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: T.serif, color: T.text }}>
            Longitudinal Trends + Head Contact Score
            <Info
              title="Longitudinal trend analysis"
              formula="Weekly mean per metric · contact_score = mean(None→0, Low→1, Med→2, High→3)"
              citation="Dashnaw et al. (2012) Sports Health — cumulative sub-concussive exposure; Lempke et al. (2020)"
            />
          </h2>

          {loading ? <Skeleton h="h-80" /> : <LongitudinalChart data={data?.longitudinal} />}

          {!loading && (
            <InterpretationBox lines={buildRQ1Interpretation(data?.longitudinal)} />
          )}
        </section>

        {/* ── RQ2 ─────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <SectionLabel tag="RQ2" tagColor="#7B5800">
            Are there strong correlates between biomarker changes and same-day head contact level or
            reported headache? How do EEG and ENG measures co-vary across the camp?
          </SectionLabel>

          <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: T.serif, color: T.text }}>
            Cross-Variable Correlation Matrix
            <Info
              title="Spearman ρ correlation matrix"
              formula="Spearman ρ for all pairs — handles ordinal (head contact) × continuous and small n\nPre-session EEG readings used as daily neurological baseline"
              citation="Siegel (1956) Nonparametric Statistics — Spearman appropriate for ordinal×continuous; Slobounov et al. (2010)"
            />
          </h2>

          {loading ? <Skeleton h="h-72" /> : <CorrelationMatrix data={data?.correlationMatrix} />}

          {!loading && (
            <InterpretationBox lines={buildRQ2Interpretation(data?.correlationMatrix)} />
          )}
        </section>

        {/* ── Footer glossary ─────────────────────────────────────────────── */}
        <MetricGlossary />

      </div>
    </div>
  )
}
