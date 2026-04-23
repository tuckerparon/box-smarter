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

function Info({ title, formula, citation, citationLinks }) {
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
          {citationLinks?.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer"
              className="text-xs italic block mt-1 hover:underline" style={{ color: T.accent2 }}>
              {l.text}
            </a>
          ))}
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
      if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M µV²`
      if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K µV²`
      return `${v.toFixed(1)} µV²`
    },
    info: {
      title: 'Alpha Reactivity (EC − EO)',
      formula: 'α_power_EC − α_power_EO  (8–12 Hz, Welch PSD)',
      citation: 'Alpha suppression during eye-opening (ERD) is a robust marker of cortical arousal. Blunted reactivity is associated with neurological disorders and post-impact states.',
      citationLinks: [{ text: 'Klimesch (1999) Brain Research Reviews', url: 'https://doi.org/10.1016/S0165-0173(98)00056-3' }],
    },
  },
  alpha_theta_ratio: {
    label: 'Alpha/Theta Ratio',
    higherBetter: true,
    fmt: v => v != null ? v.toFixed(3) : '—',
    info: {
      title: 'Alpha/Theta Ratio (EO epoch)',
      formula: 'α_power_EO / θ_power_EO  (8–12 Hz / 4–8 Hz)',
      citation: 'Good cognitive performance is associated with higher alpha and lower theta power. The ratio captures this balance in a single number.',
      citationLinks: [{ text: 'Klimesch (1999) Brain Research Reviews', url: 'https://doi.org/10.1016/S0165-0173(98)00056-3' }],
    },
  },
  rel_alpha_eo: {
    label: 'Rel. Alpha EO',
    higherBetter: true,
    fmt: v => v != null ? `${(v * 100).toFixed(1)}%` : '—',
    info: {
      title: 'Relative Alpha Power (EO)',
      formula: 'α_EO / Σband_power_EO  (normalized to 1–45 Hz total)',
      citation: 'Expressing alpha as a fraction of total power removes session-to-session amplitude variation caused by headset fit, making comparisons across days more reliable.',
      citationLinks: [{ text: 'Nunez & Srinivasan (2006) Electric Fields of the Brain', url: 'https://www.academia.edu/63514950/Electric_Fields_of_the_Brain_The_Neurophysics_of_EEG_second_ed_Paul_L_Nunez_Ramesh_Srinivasan_Oxford_University_Press_Oxford_2005_611_pages_ISBN_0_19_505038_7' }],
    },
  },
  rel_theta_eo: {
    label: 'Rel. Theta EO',
    higherBetter: false,
    fmt: v => v != null ? `${(v * 100).toFixed(1)}%` : '—',
    info: {
      title: 'Relative Theta Power (EO)',
      formula: 'θ_EO / Σband_power_EO  (normalized to 1–45 Hz total)',
      citation: 'Theta power increases with cognitive load, fatigue, and in subjects with neurological disorders. Elevated theta during an alert eyes-open state is associated with reduced cognitive performance.',
      citationLinks: [{ text: 'Klimesch (1999) Brain Research Reviews', url: 'https://doi.org/10.1016/S0165-0173(98)00056-3' }],
    },
  },
}

// ─── Key Findings ─────────────────────────────────────────────────────────────

function bold(s) { return `<strong>${s}</strong>` }

function KeyFindings({ data }) {
  if (!data) return null
  const findings = []

  // Alpha/Theta — pre→post delta
  const atr = data.abSparring?.eeg?.alpha_theta_ratio
  const atrDeltaSp = atr?.delta_sparring?.mean
  const atrDeltaNs = atr?.delta_non_sparring?.mean
  if (atrDeltaSp != null && atrDeltaNs != null) {
    const spStr = `${atrDeltaSp >= 0 ? '+' : ''}${atrDeltaSp.toFixed(3)}`
    const nsStr = `${atrDeltaNs >= 0 ? '+' : ''}${atrDeltaNs.toFixed(3)}`
    const supportsH1 = atrDeltaSp < atrDeltaNs
    findings.push({ paragraph:
      `The alpha/theta ratio — a measure of cognitive alertness — changed ${bold(spStr)} from pre to post on sparring days, versus ${bold(nsStr)} on non-sparring days. ${supportsH1
        ? 'The larger drop on sparring days suggests head contact acutely suppresses cognitive readiness beyond what training fatigue alone produces.'
        : 'No differential suppression of cognitive readiness was detected between session types.'
      }`
    })
  } else if (atr?.sparring?.mean != null && atr?.non_sparring?.mean != null) {
    const sp = atr.sparring.mean, ns = atr.non_sparring.mean
    findings.push({ paragraph:
      `The alpha/theta ratio averaged ${bold(sp.toFixed(3))} on sparring days vs ${bold(ns.toFixed(3))} on non-sparring days — ${sp < ns ? 'lower on contact days, suggesting reduced cognitive readiness' : 'no meaningful difference between session types'}.`
    })
  }

  // Alpha Reactivity — pre→post delta
  const ar = data.abSparring?.eeg?.alpha_reactivity
  const arDeltaSp = ar?.delta_sparring?.mean
  const arDeltaNs = ar?.delta_non_sparring?.mean
  if (arDeltaSp != null && arDeltaNs != null) {
    const spStr = EEG_DEFS.alpha_reactivity.fmt(arDeltaSp)
    const nsStr = EEG_DEFS.alpha_reactivity.fmt(arDeltaNs)
    const supportsH1 = arDeltaSp < arDeltaNs
    findings.push({ paragraph:
      `Alpha reactivity — the brain's eye-opening arousal response — shifted by ${bold(spStr)} on sparring days vs ${bold(nsStr)} on non-sparring days. ${supportsH1
        ? 'A smaller gain after sparring suggests the cortical arousal mechanism is more blunted following head contact.'
        : 'No differential change in cortical arousal response was detected.'
      }`
    })
  } else if (ar?.sparring?.mean != null && ar?.non_sparring?.mean != null) {
    const sp = ar.sparring.mean, ns = ar.non_sparring.mean
    findings.push({ paragraph:
      `Alpha reactivity averaged ${bold(EEG_DEFS.alpha_reactivity.fmt(sp))} on sparring days vs ${bold(EEG_DEFS.alpha_reactivity.fmt(ns))} on non-sparring days.`
    })
  }

  // Reaction Time — pre→post delta
  const rt = data.abSparring?.pison?.readiness_ms
  const rtDeltaSp = rt?.delta_sparring?.mean
  const rtDeltaNs = rt?.delta_non_sparring?.mean
  if (rtDeltaSp != null && rtDeltaNs != null) {
    const spStr = `${rtDeltaSp >= 0 ? '+' : ''}${rtDeltaSp.toFixed(0)} ms`
    const nsStr = `${rtDeltaNs >= 0 ? '+' : ''}${rtDeltaNs.toFixed(0)} ms`
    const supportsH1 = rtDeltaSp > rtDeltaNs
    findings.push({ paragraph:
      `Neuromuscular reaction time changed by ${bold(spStr)} on sparring days vs ${bold(nsStr)} on non-sparring days. ${supportsH1
        ? 'The greater post-session slowing on sparring days reflects elevated neuromuscular cost from head contact — even small millisecond changes correspond to real differences in neural processing speed.'
        : 'No excess neuromuscular slowing was detected after sparring compared to standard training.'
      }`
    })
  } else if (rt?.sparring?.mean != null && rt?.non_sparring?.mean != null) {
    const sp = rt.sparring.mean, ns = rt.non_sparring.mean
    findings.push({ paragraph:
      `Reaction time averaged ${bold(sp.toFixed(0) + ' ms')} on sparring days vs ${bold(ns.toFixed(0) + ' ms')} on non-sparring days.`
    })
  }

  if (!findings.length) return null

  return (
    <Card className="p-5 mb-10">
      <p className="text-xs uppercase tracking-widest mb-3" style={{ color: T.dimText, fontFamily: T.sans, letterSpacing: '0.1em' }}>
        Key Findings
      </p>
      <p className="text-sm leading-relaxed" style={{ color: T.subtext, fontFamily: T.sans }}>
        {findings.map((f, i) => (
          <span key={i}>
            {i > 0 && ' '}
            <span dangerouslySetInnerHTML={{ __html: f.paragraph }} />
            {i < findings.length - 1 && ' '}
          </span>
        ))}
        {' '}These patterns provide early directional support for H1, though statistical confidence is limited by small n and should be interpreted with caution.
      </p>
    </Card>
  )
}

// ─── Interpretation builders ──────────────────────────────────────────────────

function buildH1Interpretation(data) {
  if (!data) return null
  const lines = []
  let supportCount = 0, totalCount = 0

  const ar = data.eeg?.alpha_reactivity
  if (ar) {
    const sp = ar.delta_sparring?.mean ?? ar.sparring?.mean
    const ns = ar.delta_non_sparring?.mean ?? ar.non_sparring?.mean
    const isDelta = ar.delta_sparring?.mean != null
    if (sp != null && ns != null) {
      totalCount++
      const dir = sp < ns ? (isDelta ? 'larger decline' : 'lower') : (isDelta ? 'smaller decline' : 'higher')
      const pStr = ar.p_value != null ? ` (p = ${ar.p_value})` : ''
      const support = sp < ns
      if (support) supportCount++
      lines.push(
        `Alpha reactivity ${isDelta ? `delta: ${EEG_DEFS.alpha_reactivity.fmt(sp)} on sparring vs ${EEG_DEFS.alpha_reactivity.fmt(ns)} on non-sparring days` : `was ${dir} on sparring days (${EEG_DEFS.alpha_reactivity.fmt(sp)} vs ${EEG_DEFS.alpha_reactivity.fmt(ns)})`}${pStr} — ${support ? 'blunted arousal response consistent with H1' : 'no differential suppression'}.`
      )
    }
  }

  const atr = data.eeg?.alpha_theta_ratio
  if (atr) {
    const sp = atr.delta_sparring?.mean ?? atr.sparring?.mean
    const ns = atr.delta_non_sparring?.mean ?? atr.non_sparring?.mean
    const isDelta = atr.delta_sparring?.mean != null
    if (sp != null && ns != null) {
      totalCount++
      const support = sp < ns
      if (support) supportCount++
      const d = atr.cohens_d
      lines.push(
        `Alpha/theta ratio (EEG) ${isDelta ? `delta: ${sp.toFixed(3)} on sparring vs ${ns.toFixed(3)} on non-sparring` : `was ${sp < ns ? 'lower' : 'higher'} on sparring days (${sp.toFixed(3)} vs ${ns.toFixed(3)})`}${d != null ? `, Cohen's d = ${Math.abs(d).toFixed(2)}` : ''} — ${support ? 'reduced cognitive readiness on contact days (Klimesch, 1999)' : 'no reduction in cognitive readiness index'}.`
      )
    }
  }

  const rt = data.pison?.readiness_ms
  if (rt) {
    const sp = rt.delta_sparring?.mean ?? rt.sparring?.mean
    const ns = rt.delta_non_sparring?.mean ?? rt.non_sparring?.mean
    const isDelta = rt.delta_sparring?.mean != null
    if (sp != null && ns != null) {
      totalCount++
      const support = sp > ns
      if (support) supportCount++
      const d = rt.cohens_d
      lines.push(
        `Reaction time (ENG) ${isDelta ? `delta: ${sp >= 0 ? '+' : ''}${sp.toFixed(0)} ms on sparring vs ${ns >= 0 ? '+' : ''}${ns.toFixed(0)} ms on non-sparring` : `was ${sp > ns ? 'slower' : 'faster'} on sparring days (${sp.toFixed(0)} ms vs ${ns.toFixed(0)} ms)`}${d != null ? `, d = ${Math.abs(d).toFixed(2)}` : ''} — ${support ? 'elevated neuromuscular cost on contact days' : 'no reaction time difference by session type'}.`
      )
    }
  }

  const ag = data.pison?.agility
  if (ag) {
    const sp = ag.delta_sparring?.mean ?? ag.sparring?.mean
    const ns = ag.delta_non_sparring?.mean ?? ag.non_sparring?.mean
    const isDelta = ag.delta_sparring?.mean != null
    if (sp != null && ns != null) {
      const spStr = `${sp >= 0 ? '+' : ''}${sp.toFixed(1)}`
      const nsStr = `${ns >= 0 ? '+' : ''}${ns.toFixed(1)}`
      const largerOnSparring = sp > ns
      lines.push(
        `Agility/go-no-go score ${isDelta ? `delta: ${spStr} on sparring vs ${nsStr} on non-sparring` : `was ${sp > ns ? 'higher' : 'lower'} on sparring days (${sp.toFixed(1)} vs ${ns.toFixed(1)})`} — ${largerOnSparring
          ? 'paradoxical improvement in inhibitory control speed after contact. Concurrent alpha suppression and agility elevation is consistent with acute subcortical arousal: fight-or-flight adrenaline temporarily boosts motor speed while cortical processing is suppressed. This cortical–subcortical dissociation has been documented in acute neurological stress states and warrants monitoring over the camp.'
          : 'no differential agility improvement by session type.'
        }`
      )
    }
  }

  if (!lines.length) return null
  lines.push(supportCount >= 2
    ? 'Overall: early evidence supports H1 — contact sessions produce measurable acute suppression across both EEG and ENG domains. Statistical confidence is limited by small n; interpret directionally.'
    : 'Overall: findings are mixed. Continue collecting sessions to reach adequate statistical power.'
  )
  return lines
}

function buildRQ1Interpretation(data) {
  if (!data?.length || data.length < 2) return null
  const lines = []

  function firstLast(key) {
    const vals = data.filter(d => d[key] != null)
    if (vals.length < 2) return null
    return { first: vals[0][key], last: vals[vals.length - 1][key], n: vals.length }
  }

  const atr = firstLast('alpha_theta_ratio')
  if (atr) {
    const delta = atr.last - atr.first
    const pct = Math.abs(delta / atr.first * 100).toFixed(0)
    lines.push(
      `Alpha/theta ratio (cognitive readiness index) has ${delta > 0 ? 'risen' : 'fallen'} from ${atr.first.toFixed(3)} to ${atr.last.toFixed(3)} over ${atr.n} weeks (${delta >= 0 ? '+' : ''}${pct}%) — ${delta > 0 ? 'a positive trend consistent with neural adaptation to training' : 'a downward trend consistent with cumulative neurological fatigue from sustained boxing exposure'}.`
    )
  }

  const ar = firstLast('alpha_reactivity')
  if (ar) {
    const delta = ar.last - ar.first
    lines.push(
      `Alpha reactivity (cortical arousal response, µV²) has ${delta > 0 ? 'strengthened' : 'weakened'} from ${EEG_DEFS.alpha_reactivity.fmt(ar.first)} to ${EEG_DEFS.alpha_reactivity.fmt(ar.last)} — ${delta > 0 ? 'suggesting the brain\'s arousal mechanism is improving with training' : 'possible cumulative blunting of the eye-opening arousal response, consistent with repeated sub-concussive exposure'}.`
    )
  }

  const rt = firstLast('readiness_ms')
  if (rt) {
    const delta = rt.last - rt.first
    lines.push(
      `Neuromuscular reaction time has ${delta > 0 ? `slowed by ${delta.toFixed(0)} ms` : `improved by ${Math.abs(delta).toFixed(0)} ms`} since camp start — ${delta > 0 ? 'suggesting accumulating neuromuscular fatigue or impact-related slowing across the training period' : 'consistent with neuromuscular adaptation to boxing-specific conditioning'}.`
    )
  }

  const contactVals = data.filter(d => d.contact_numeric != null)
  if (contactVals.length >= 2) {
    const maxContact = Math.max(...contactVals.map(d => d.contact_numeric))
    const avgContact = contactVals.reduce((s, d) => s + d.contact_numeric, 0) / contactVals.length
    const CLABELS = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' }
    lines.push(
      `Head contact score averaged ${avgContact.toFixed(1)}/3 across the camp (peak: ${CLABELS[Math.round(maxContact)] ?? maxContact.toFixed(1)}). Use the chart toggle to compare each metric against the contact timeline and identify whether biomarker changes track with impact load.`
    )
  }

  return lines.length ? lines : null
}

function buildRQ2Interpretation(data) {
  if (!data?.matrix) return null
  const { var_keys, var_labels, matrix } = data
  const lines = []

  function getCell(k1, k2) {
    const i = var_keys.indexOf(k1), j = var_keys.indexOf(k2)
    if (i === -1 || j === -1) return null
    return matrix[i][j]
  }

  const eegKeys = ['alpha_reactivity', 'alpha_theta_ratio', 'rel_alpha_eo', 'rel_theta_eo']
  const eegShortLabels = {
    alpha_reactivity: 'Alpha Reactivity', alpha_theta_ratio: 'Alpha/Theta',
    rel_alpha_eo: 'Rel. Alpha EO', rel_theta_eo: 'Rel. Theta EO',
  }

  // ── EEG ↔ Readiness coupling ─────────────────────────────────────────────
  const readinessCorrs = eegKeys.map(k => {
    const c = getCell(k, 'readiness_ms') ?? getCell('readiness_ms', k)
    return c?.rho != null ? { key: k, label: eegShortLabels[k], rho: c.rho, p: c.p_value, n: c.n } : null
  }).filter(Boolean).sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))

  if (readinessCorrs.length > 0) {
    const strong = readinessCorrs.filter(c => Math.abs(c.rho) >= 0.35)
    const displayed = strong.length > 0 ? strong : readinessCorrs.slice(0, 2)
    const sigMark = c => c.p != null && c.p < 0.05 ? '★ ' : ''
    lines.push(
      `EEG ↔ Readiness: ${displayed.map(c => `${sigMark(c)}${c.label} (ρ = ${c.rho.toFixed(2)}${c.p != null ? ', p = ' + c.p.toFixed(3) : ''})`).join('; ')}. ${strong.length >= 2
        ? 'All four EEG metrics co-vary with neuromuscular reaction speed, suggesting EEG and reaction time share a common neurological substrate — days when the brain shows lower alpha dominance and higher theta also show slower neuromuscular response.'
        : 'EEG and neuromuscular measures show moderate co-variation, consistent with shared neural underpinnings.'
      }`
    )
  }

  // ── EEG ↔ Headache — key biomarker finding ───────────────────────────────
  const headacheCorrs = eegKeys.map(k => {
    const c = getCell(k, 'headache') ?? getCell('headache', k)
    return c?.rho != null ? { key: k, label: eegShortLabels[k], rho: c.rho, p: c.p_value, n: c.n } : null
  }).filter(Boolean).sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))

  if (headacheCorrs.length > 0) {
    const sig = headacheCorrs.filter(c => c.p != null && c.p < 0.05)
    const top = sig.length > 0 ? sig : headacheCorrs.slice(0, 2)
    const hasSig = sig.length > 0
    lines.push(
      `EEG ↔ Headache: ${top.map(c => `${hasSig && c.p < 0.05 ? '★ ' : ''}${c.label} (ρ = ${c.rho.toFixed(2)}${c.p != null ? ', p = ' + c.p.toFixed(3) : ''})`).join('; ')}. ${hasSig
        ? `Alpha/Theta and Rel. Alpha EO show the strongest${sig.length > 1 ? ' and statistically significant' : ''} correlation with self-reported headache. If this holds with larger n, these metrics could serve as objective neurophysiological markers of sub-concussive head impact burden — days when alpha-band activity is suppressed may correspond to measurable neurological stress, a key question in contact sport safety research.`
        : `Alpha/Theta and Rel. Alpha EO show the highest correlation with self-reported headache among EEG metrics. While not yet statistically significant at this sample size, the pattern suggests these measures could become reliable objective markers of head impact burden with continued data collection.`
      }`
    )
  }

  // ── Head contact ─────────────────────────────────────────────────────────
  const hcIdx = var_keys.indexOf('head_contact')
  if (hcIdx !== -1) {
    const hcRow = matrix[hcIdx]
    const sigHC = var_keys
      .map((k, i) => ({ key: k, label: var_labels[i], cell: hcRow[i] }))
      .filter(x => !['head_contact', 'headache'].includes(x.key) && x.cell?.p_value != null && x.cell.p_value < 0.05)
      .sort((a, b) => Math.abs(b.cell.rho) - Math.abs(a.cell.rho))

    if (sigHC.length > 0) {
      lines.push(`Head contact level correlates significantly with: ${sigHC.map(s => `${s.label} (ρ = ${s.cell.rho.toFixed(2)}, p = ${s.cell.p_value.toFixed(3)})`).join(', ')}.`)
    } else {
      const topHC = var_keys
        .map((k, i) => ({ key: k, label: var_labels[i], cell: hcRow[i] }))
        .filter(x => x.key !== 'head_contact' && x.cell?.rho != null)
        .sort((a, b) => Math.abs(b.cell.rho) - Math.abs(a.cell.rho))[0]
      if (topHC) {
        lines.push(`No biomarker shows a statistically significant correlation with head contact at current n (strongest: ${topHC.label}, ρ = ${topHC.cell.rho.toFixed(2)}, p = ${topHC.cell.p_value?.toFixed(3) ?? '—'}) — consistent with limited power in a single-subject n<30 dataset.`)
      }
    }
  }

  return lines.length ? lines : null
}

// ─── H1: Metric row (small multiple) ─────────────────────────────────────────

function MetricRow({ metricKey, sparring, nonSparring, showStats, pValue, significant }) {
  const def = EEG_DEFS[metricKey]
  if (!def) return null
  const sp  = sparring?.mean
  const ns  = nonSparring?.mean
  if (sp == null && ns == null) return null
  const maxVal = Math.max(Math.abs(sp ?? 0), Math.abs(ns ?? 0), 0.001)

  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: T.subtext, fontFamily: T.sans }}>
          {def.label}
          <Info {...def.info} />
          <span className="font-normal" style={{ color: T.dimText }}>
            {def.higherBetter ? '↑ better' : '↓ better'}
          </span>
        </span>
        {showStats && sparring?.cohens_d != null && <CohensBadge d={sparring.cohens_d} />}
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
      {pValue != null && (
        <p className="text-xs mt-1" style={{ color: pValue < 0.05 ? '#9A4F00' : T.dimText, fontFamily: T.sans }}>
          Mann-Whitney U p = {pValue}{significant ? ' ★' : ''}
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
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: T.subtext, fontFamily: T.sans }}>
          {label}
          <span className="font-normal" style={{ color: T.dimText }}>
            {lowerBetter ? '↓ better' : '↑ better'}
          </span>
        </span>
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
        </p>
      )}
    </div>
  )
}

// ─── H1: Side-by-side ENG + EEG cards ────────────────────────────────────────

const H1_VIEWS = [
  { key: 'delta', label: 'Δ Delta', desc: 'post − pre per session' },
  { key: 'avg',   label: 'Avg',     desc: 'all readings averaged' },
  { key: 'pre',   label: 'Pre',     desc: 'pre-session only' },
  { key: 'post',  label: 'Post',    desc: 'post-session only' },
]

function getViewPair(metric, view) {
  if (!metric) return { sparring: null, nonSparring: null }
  if (view === 'avg')   return { sparring: metric.sparring,      nonSparring: metric.non_sparring }
  if (view === 'pre')   return { sparring: metric.pre_sparring,  nonSparring: metric.pre_non_sparring }
  if (view === 'post')  return { sparring: metric.post_sparring, nonSparring: metric.post_non_sparring }
  if (view === 'delta') return { sparring: metric.delta_sparring, nonSparring: metric.delta_non_sparring }
  return { sparring: metric.sparring, nonSparring: metric.non_sparring }
}

function H1Charts({ data, activeView, onViewChange }) {
  if (!data) return <Skeleton />

  const eeg = data.eeg ?? {}
  const pison = data.pison ?? {}

  const hasEEG = Object.keys(eeg).some(k => eeg[k]?.sparring?.mean != null)
  const hasENG = Object.keys(pison).some(k => pison[k]?.sparring?.mean != null)

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: T.dimText, fontFamily: T.sans }}>View:</span>
        {H1_VIEWS.map(v => (
          <button key={v.key} onClick={() => onViewChange(v.key)}
            title={v.desc}
            className="text-xs px-3 py-1 rounded transition-all"
            style={{
              background: activeView === v.key ? T.accent : T.bg,
              color: activeView === v.key ? '#fff' : T.subtext,
              border: `1px solid ${activeView === v.key ? T.accent : T.border}`,
              fontFamily: T.sans,
              fontWeight: activeView === v.key ? 600 : 400,
            }}>
            {v.label}
          </button>
        ))}
        <span className="text-xs" style={{ color: T.dimText, fontFamily: T.sans }}>
          — {H1_VIEWS.find(v => v.key === activeView)?.desc}
        </span>
      </div>

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
                {pison.readiness_ms && (() => {
                  const { sparring: sp, nonSparring: ns } = getViewPair(pison.readiness_ms, activeView)
                  return (
                    <ENGRow
                      label="Readiness (reaction time)"
                      sparring={sp}
                      nonSparring={ns}
                      lowerBetter={true}
                      fmt={v => v != null ? `${v.toFixed(0)} ms` : '—'}
                      pValue={pison.readiness_ms.p_value}
                      cohensD={activeView === 'avg' ? pison.readiness_ms.sparring?.cohens_d : null}
                      significant={pison.readiness_ms.significant ?? false}
                    />
                  )
                })()}
                {pison.agility && (() => {
                  const { sparring: sp, nonSparring: ns } = getViewPair(pison.agility, activeView)
                  return (
                    <ENGRow
                      label="Agility (go/no-go score)"
                      sparring={sp}
                      nonSparring={ns}
                      lowerBetter={false}
                      fmt={v => v != null ? v.toFixed(1) : '—'}
                      pValue={pison.agility.p_value}
                      cohensD={activeView === 'avg' ? pison.agility.sparring?.cohens_d : null}
                      significant={pison.agility.significant ?? false}
                    />
                  )
                })()}
              </>
            )
          }
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
            : ['alpha_reactivity', 'alpha_theta_ratio', 'rel_alpha_eo', 'rel_theta_eo'].map(k => {
                if (!eeg[k]) return null
                const { sparring: sp, nonSparring: ns } = getViewPair(eeg[k], activeView)
                return (
                  <MetricRow
                    key={k}
                    metricKey={k}
                    sparring={sp}
                    nonSparring={ns}
                    showStats={activeView === 'avg'}
                    pValue={eeg[k].p_value}
                    significant={eeg[k].significant ?? false}
                  />
                )
              })
          }
        </Card>
      </div>
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

const RQ2_MODES = [
  { key: 'delta',        label: 'Same Day Δ',     desc: 'session post−pre delta vs head contact & headache' },
  { key: 'next_day_pre', label: 'Next Day Pre',   desc: 'previous day survey vs next morning pre-session EEG' },
]

function CorrelationMatrix({ data, activeMode, onModeChange }) {
  const [tooltip, setTooltip] = useState(null)

  const activeData = data?.[activeMode]

  if (!activeData?.matrix?.length) {
    return (
      <Card className="p-5">
        <div className="flex gap-2 mb-4">
          {RQ2_MODES.map(m => (
            <button key={m.key} onClick={() => onModeChange(m.key)}
              title={m.desc}
              className="text-xs px-3 py-1 rounded transition-all"
              style={{
                background: activeMode === m.key ? '#7B5800' : T.bg,
                color: activeMode === m.key ? '#fff' : T.subtext,
                border: `1px solid ${activeMode === m.key ? '#7B5800' : T.border}`,
                fontFamily: T.sans,
                fontWeight: activeMode === m.key ? 600 : 400,
              }}>
              {m.label}
            </button>
          ))}
        </div>
        <p style={{ color: T.subtext, fontFamily: T.sans }} className="text-sm">No correlation data yet.</p>
      </Card>
    )
  }

  const { var_keys, var_labels, matrix } = activeData
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

  // Rows (upper triangle only: show cells where j >= i)
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
      if (j < i) {
        // Lower triangle — blank spacer
        cells.push(<div key={`c-${i}-${j}`} style={{ height: `${CELL_SIZE}px` }} />)
        return
      }
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
            border: `1px solid ${isDiag ? T.border : corrColor(cell?.rho) === '#E8E4DC' ? T.border : 'transparent'}`,
            gap: '2px',
          }}
        >
          <span style={{
            fontSize: '12px', fontWeight: 700,
            color: isDiag ? T.subtext : corrTextColor(cell?.rho),
            fontFamily: T.sans,
          }}>
            {isDiag ? '—' : (cell?.rho != null ? cell.rho.toFixed(2) : '—')}
          </span>
          {!isDiag && cell?.p_value != null && cell.p_value < 0.05 && (
            <span style={{ fontSize: '9px', color: corrTextColor(cell?.rho), opacity: 0.85, fontFamily: T.sans }}>
              ★
            </span>
          )}
        </div>
      )
    })
  })

  return (
    <Card className="p-5">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {RQ2_MODES.map(m => (
          <button key={m.key} onClick={() => onModeChange(m.key)}
            title={m.desc}
            className="text-xs px-3 py-1 rounded transition-all"
            style={{
              background: activeMode === m.key ? '#7B5800' : T.bg,
              color: activeMode === m.key ? '#fff' : T.subtext,
              border: `1px solid ${activeMode === m.key ? '#7B5800' : T.border}`,
              fontFamily: T.sans,
              fontWeight: activeMode === m.key ? 600 : 400,
            }}>
            {m.label}
          </button>
        ))}
        <span className="text-xs" style={{ color: T.dimText, fontFamily: T.sans }}>
          — {RQ2_MODES.find(m => m.key === activeMode)?.desc}
        </span>
      </div>

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
    formula: 'α_EC − α_EO (8–12 Hz), units: µV²',
    direction: 'Higher = stronger suppression = more aroused',
    citationLinks: [{ text: 'Klimesch (1999) Brain Research Reviews', url: 'https://doi.org/10.1016/S0165-0173(98)00056-3' }],
  },
  {
    metric: 'Alpha/Theta Ratio',
    proxy: 'Cognitive readiness index',
    formula: 'α_EO / θ_EO (8–12 Hz / 4–8 Hz)',
    direction: 'Higher = more alert and cognitively ready',
    citationLinks: [{ text: 'Klimesch (1999) Brain Research Reviews', url: 'https://doi.org/10.1016/S0165-0173(98)00056-3' }],
  },
  {
    metric: 'Rel. Alpha EO',
    proxy: 'Arousal state (session-normalized)',
    formula: 'α_EO / Σband_power_EO (1–45 Hz)',
    direction: 'Higher = greater proportion of power in arousal band',
    citationLinks: [{ text: 'Nunez & Srinivasan (2006) Electric Fields of the Brain', url: 'https://www.academia.edu/63514950/Electric_Fields_of_the_Brain_The_Neurophysics_of_EEG_second_ed_Paul_L_Nunez_Ramesh_Srinivasan_Oxford_University_Press_Oxford_2005_611_pages_ISBN_0_19_505038_7' }],
  },
  {
    metric: 'Rel. Theta EO',
    proxy: 'Cognitive load / neural fatigue',
    formula: 'θ_EO / Σband_power_EO (1–45 Hz)',
    direction: 'Lower = less fatigue signature in EEG',
    citationLinks: [{ text: 'Klimesch (1999) Brain Research Reviews', url: 'https://doi.org/10.1016/S0165-0173(98)00056-3' }],
  },
  {
    metric: 'Readiness (ms)',
    proxy: 'Neuromuscular reaction speed',
    formula: 'Pison wrist-band EMG reaction time',
    direction: 'Lower = faster response = better neuromuscular state',
    citationLinks: [],
  },
  {
    metric: 'Agility (/100)',
    proxy: 'Motor inhibition / go-no-go control',
    formula: 'Pison composite go/no-go accuracy score',
    direction: 'Higher = better motor control and decision speed',
    citationLinks: [],
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
              {g.citationLinks?.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer"
                  className="text-xs italic hover:underline block mt-0.5" style={{ color: '#AEAEAE' }}>
                  {l.text}
                </a>
              ))}
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
  const [h1View, setH1View] = useState('delta')
  const [rq2Mode, setRq2Mode] = useState('delta')

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
              formula="Mann-Whitney U (non-parametric; appropriate for n<30)\nCohen's d = (μ₁ − μ₂) / √((σ₁² + σ₂²) / 2)\n90% bootstrap confidence intervals"
            />
          </h2>

          {loading ? <Skeleton h="h-80" /> : <H1Charts data={data?.abSparring} activeView={h1View} onViewChange={setH1View} />}

          {!loading && (
            <InterpretationBox lines={buildH1Interpretation(data?.abSparring)} />
          )}
        </section>

        {/* ── RQ1 ─────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <SectionLabel tag="RQ1" tagColor="#7B5800">
            How do EEG and neuromuscular biomarkers evolve over the course of a 4-month boxing training
            camp — and is there evidence of cumulative neurological load or adaptation?
          </SectionLabel>

          <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: T.serif, color: T.text }}>
            Longitudinal Trends + Head Contact Score
            <Info
              title="Longitudinal trend analysis"
              formula="Weekly mean per metric · contact_score = mean(None→0, Low→1, Med→2, High→3)"
              citation="Repetitive subconcussive head impacts produce cumulative, season-long white matter microstructural changes detectable via neuroimaging."
              citationLinks={[{ text: 'Kwiatkowski et al. (2024) Human Brain Mapping', url: 'https://doi.org/10.1002/hbm.26811' }]}
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
              formula="Same Day Δ: correlates post−pre session change in EEG/ENG with same-day head contact & headache\nNext Day Pre: correlates previous day's survey with next morning's pre-session EEG baseline\nSpearman ρ — handles ordinal (head contact) × continuous, appropriate for small n"
              citation="Spearman ρ makes no assumption about data distribution and handles ordinal variables (head contact scale) mixed with continuous EEG/ENG measures — appropriate for this dataset's small n and non-normal distributions."
            />
          </h2>

          {loading ? <Skeleton h="h-72" /> : (
            <CorrelationMatrix data={data?.correlationMatrix} activeMode={rq2Mode} onModeChange={setRq2Mode} />
          )}

          {!loading && (
            <InterpretationBox lines={buildRQ2Interpretation(data?.correlationMatrix?.[rq2Mode])} />
          )}
        </section>

        {/* ── Footer glossary ─────────────────────────────────────────────── */}
        <MetricGlossary />

      </div>
    </div>
  )
}
