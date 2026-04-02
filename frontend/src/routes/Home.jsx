import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LogModal from '../components/LogModal'

const BRANDS = [
  {
    key: 'neurable',
    logo: '/logos/neurable_logo.png',
    name: 'Neurable',
    desc: 'EEG · Alpha / Theta / Delta',
    accent: '#7c3aed',
    logoStyle: { filter: 'invert(1)', opacity: 0.9 },
  },
  {
    key: 'pison',
    logo: '/logos/pison_logo.webp',
    name: 'Pison',
    desc: 'Neuromuscular · Reaction & Agility',
    accent: '#0d9488',
    logoStyle: {},
  },
  {
    key: 'whoop',
    logo: '/logos/whoop_logo.png',
    name: 'WHOOP',
    desc: 'Recovery · HRV · Sleep',
    accent: '#22c55e',
    logoStyle: {},
  },
  {
    key: 'oura',
    logo: '/logos/oura_logo.png',
    name: 'Oura',
    desc: 'Readiness · Sleep Stages',
    accent: '#b8973c',
    logoStyle: {},
  },
]

const FIGHT_DATE = new Date('2026-05-07T00:00:00')

function daysTo(target) {
  const now = new Date()
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)))
}

export default function Home() {
  const navigate = useNavigate()
  const [logOpen, setLogOpen] = useState(false)
  const days = daysTo(FIGHT_DATE)

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#080808', color: '#f5f5f5', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 pt-8 pb-4">
        <div>
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: '#f5f5f5', letterSpacing: '-0.02em' }}
          >
            BoxSmart
          </span>
          <span
            className="ml-2 text-xs font-medium px-2 py-0.5 rounded"
            style={{ background: '#1a1a1a', color: '#6b7280', border: '1px solid #262626' }}
          >
            STUDY
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://www.hackh4h.com/"
            target="_blank"
            rel="noreferrer"
            className="text-sm px-4 py-2 rounded font-medium transition-opacity hover:opacity-80"
            style={{ background: '#1a1a1a', color: '#9ca3af', border: '1px solid #262626' }}
          >
            Donate
          </a>
          <button
            onClick={() => setLogOpen(true)}
            className="text-sm px-4 py-2 rounded font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#f5f5f5', color: '#080808' }}
          >
            Log
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="flex flex-col items-center justify-center px-8 pt-16 pb-12 text-center">
        <h1
          className="text-6xl font-black mb-4"
          style={{ letterSpacing: '-0.04em', lineHeight: 1 }}
        >
          BoxSmart
        </h1>
        <p className="text-base mb-8 max-w-lg" style={{ color: '#6b7280', lineHeight: 1.7 }}>
          Tracking the neurological impact of a 4-month boxing training camp
          using EEG, neuromuscular response, and recovery data.
        </p>

        {/* Countdown */}
        <div
          className="inline-flex flex-col items-center px-10 py-5 rounded-lg"
          style={{ background: '#111111', border: '1px solid #1f1f1f' }}
        >
          <span
            className="text-5xl font-black tabular-nums"
            style={{ letterSpacing: '-0.04em', color: '#f5f5f5' }}
          >
            {days}
          </span>
          <span className="text-xs mt-1 uppercase tracking-widest" style={{ color: '#4b5563' }}>
            days to fight night · May 7, 2026
          </span>
        </div>
      </section>

      {/* ── Brand Cards (informational only) ── */}
      <section className="px-8 pb-10">
        <p className="text-center text-xs mb-6 uppercase tracking-widest" style={{ color: '#374151' }}>
          Data Sources
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {BRANDS.map(b => (
            <div
              key={b.key}
              className="flex flex-col items-start p-5 rounded-lg"
              style={{
                background: '#111111',
                border: '1px solid #1f1f1f',
                borderBottom: `2px solid ${b.accent}`,
              }}
            >
              <div className="h-8 flex items-center mb-3">
                <div style={b.logoWrap || {}}>
                  <img
                    src={b.logo}
                    alt={b.name}
                    className="max-h-8 max-w-full object-contain"
                    style={b.logoStyle}
                  />
                </div>
              </div>
              <p className="text-sm font-semibold" style={{ color: '#f5f5f5' }}>{b.name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#4b5563' }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="flex justify-center pb-20">
        <button
          onClick={() => navigate('/neurable')}
          className="px-8 py-3 rounded-lg font-semibold text-sm transition-opacity hover:opacity-80"
          style={{ background: '#f5f5f5', color: '#080808' }}
        >
          Continue to Results →
        </button>
      </section>

      {logOpen && <LogModal onClose={() => setLogOpen(false)} />}
    </div>
  )
}
