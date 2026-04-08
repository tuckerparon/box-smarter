import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LogModal from '../components/LogModal'

const FIGHT_DATE = new Date('2026-05-07T00:00:00')

function daysTo(target) {
  const now = new Date()
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)))
}

const DATA_SOURCES = [
  {
    name: 'Neurable MW75',
    type: 'EEG',
    desc: 'Raw temporal EEG',
    color: '#1A4A8A',
  },
  {
    name: 'Pison',
    type: 'ENG',
    desc: 'Reaction Time · Agility (Go/No-Go)',
    color: '#2E7D32',
  },
  {
    name: 'WHOOP MG',
    type: 'PPG',
    desc: 'Strain · Recovery · Sleep',
    color: '#B22222',
  },
  {
    name: 'Daily Survey',
    type: 'Self-report',
    desc: 'Head Contact · Training · Supplements',
    color: '#7B5800',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const [logOpen, setLogOpen] = useState(false)
  const days = daysTo(FIGHT_DATE)

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: '#F7F6F2',
        color: '#1A1A1A',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ── Nav ── */}
      <header
        className="flex items-center justify-between px-8 py-4"
        style={{ borderBottom: '1px solid #E3DFD6' }}
      >
        <div className="flex items-center gap-3">
          <span
            style={{
              fontFamily: 'Georgia, "Times New Roman", Times, serif',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: '#1A1A1A',
              letterSpacing: '-0.01em',
            }}
          >
            BoxSmart
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: '#EEE9E0',
              color: '#7A6A50',
              border: '1px solid #E3DFD6',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '0.04em',
            }}
          >
            LONGITUDINAL STUDY
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://www.hackh4h.com/"
            target="_blank"
            rel="noreferrer"
            className="text-sm px-4 py-1.5 rounded font-medium transition-opacity hover:opacity-70"
            style={{
              background: '#B22222',
              color: '#fff',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Donate
          </a>
          <button
            onClick={() => setLogOpen(true)}
            className="text-sm px-4 py-1.5 rounded font-medium transition-opacity hover:opacity-70"
            style={{
              background: 'transparent',
              color: '#5C5C5C',
              border: '1px solid #E3DFD6',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Log
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-3xl mx-auto w-full px-8 pt-20 pb-12">
        <p
          className="text-xs uppercase tracking-widest mb-5"
          style={{ color: '#9A9A9A', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Neuroscience · Sports Science · Open Data
        </p>
        <h1
          style={{
            fontFamily: 'Georgia, "Times New Roman", Times, serif',
            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            color: '#1A1A1A',
            marginBottom: '1.25rem',
          }}
        >
          Neurological Monitoring<br />
          During a Boxing Training Camp
        </h1>
        <p
          className="text-base leading-relaxed max-w-xl"
          style={{ color: '#5C5C5C', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          A prospective, single-subject longitudinal study tracking EEG, neuromuscular,
          and autonomic biomarkers across a 4-month amateur boxing training camp
          (January–May 2026). Data are collected before and after each training session
          to quantify the acute and cumulative neurological effects of head contact.
        </p>

        {/* Meta row */}
        <div
          className="flex flex-wrap gap-6 mt-8 pt-6 text-sm"
          style={{
            borderTop: '1px solid #E3DFD6',
            color: '#5C5C5C',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div>
            <span style={{ color: '#9A9A9A', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Subject</span>
            Tucker Paron
          </div>
          <div>
            <span style={{ color: '#9A9A9A', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Study Period</span>
            Jan 15 – May 7, 2026
          </div>
          <div>
            <span style={{ color: '#9A9A9A', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Event</span>
            Rock 'N Rumble XV Boston
          </div>
          <div>
            <span style={{ color: '#9A9A9A', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Days to Fight</span>
            <span style={{ color: '#B22222', fontWeight: 700, fontSize: '1.1rem' }}>{days}</span>
          </div>
        </div>
      </section>

      {/* ── Data Sources ── */}
      <section className="max-w-3xl mx-auto w-full px-8 pb-12">
        <p
          className="text-xs uppercase tracking-widest mb-5"
          style={{ color: '#9A9A9A', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Instruments &amp; Measures
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {DATA_SOURCES.map(s => (
            <div
              key={s.name}
              className="p-4 rounded"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E3DFD6',
                borderTop: `3px solid ${s.color}`,
              }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-0.5"
                style={{ color: s.color, fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', letterSpacing: '0.08em' }}
              >
                {s.type}
              </p>
              <p
                className="text-sm font-semibold"
                style={{ color: '#1A1A1A', fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                {s.name}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: '#9A9A9A', fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Hypotheses ── */}
      <section
        className="max-w-3xl mx-auto w-full px-8 pb-12"
      >
        <p
          className="text-xs uppercase tracking-widest mb-5"
          style={{ color: '#9A9A9A', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Primary Hypotheses
        </p>
        <ol className="space-y-3">
          {[
            'Sparring sessions will produce greater acute biomarker suppression than non-contact training sessions, across both EEG (alpha/theta ratio) and ENG (reaction time), measured within 30 minutes pre- and post-session.',
          ].map((h, i) => (
            <li key={i} className="flex gap-4">
              <span
                className="shrink-0 font-semibold"
                style={{
                  color: '#B22222',
                  fontFamily: 'Georgia, serif',
                  fontSize: '1rem',
                  lineHeight: 1.6,
                }}
              >
                H{i + 1}.
              </span>
              <p
                className="text-sm leading-relaxed"
                style={{ color: '#5C5C5C', fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                {h}
              </p>
            </li>
          ))}
        </ol>

        {/* Research questions */}
        <div className="mt-4 space-y-3">
          {[
            'How do EEG and autonomic biomarkers evolve over the course of a 4-month boxing training camp — and is there evidence of cumulative neurological load or adaptation?',
            'Are there strong correlates between post-session biomarker changes and same-day head contact level or reported headache?',
          ].map((q, i) => (
            <div key={i} className="flex gap-4">
              <span
                className="shrink-0 font-semibold"
                style={{
                  color: '#7B5800',
                  fontFamily: 'Georgia, serif',
                  fontSize: '1rem',
                  lineHeight: 1.6,
                }}
              >
                RQ{i + 1}.
              </span>
              <p
                className="text-sm leading-relaxed"
                style={{ color: '#5C5C5C', fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                {q}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-3xl mx-auto w-full px-8 pb-20 flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-2.5 rounded text-sm font-semibold transition-opacity hover:opacity-80"
          style={{
            background: '#1A1A1A',
            color: '#F7F6F2',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          View Results →
        </button>
        <a
          href="https://haymakersforhope.org/events/boxing/rock-n-rumble-xv-boston-2026/fighters/tucker-paron"
          target="_blank"
          rel="noreferrer"
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: '#9A9A9A', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Support the Fight →
        </a>
      </section>

      {/* ── Footer ── */}
      <footer
        className="mt-auto px-8 py-6 text-xs"
        style={{
          borderTop: '1px solid #E3DFD6',
          color: '#9A9A9A',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <span>
            Data collected daily · All analyses conducted in Python (SciPy, MNE) ·
            Statistics: Mann-Whitney U, bootstrapped 90% CI
          </span>
          <a href="/privacy" style={{ color: '#9A9A9A' }} className="hover:underline">Privacy Policy</a>
        </div>
      </footer>

      {logOpen && <LogModal onClose={() => setLogOpen(false)} />}
    </div>
  )
}
