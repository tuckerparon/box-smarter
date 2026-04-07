import { useState, useRef, useCallback } from 'react'

const API = import.meta.env.DEV ? 'http://localhost:8000' : ''

// All possible Pison tags from CLAUDE.md
const TAG_GROUPS = [
  {
    label: 'Session',
    tags: ['Pre-boxing', 'Post-boxing', 'Pre-sparring', 'Post-sparring'],
    exclusive: [['Pre-boxing', 'Post-boxing'], ['Pre-sparring', 'Post-sparring']],
  },
  {
    label: 'Location',
    tags: ['MIT', 'EBF', 'Home/Roseland', 'Harvard'],
    exclusive: [['MIT', 'EBF', 'Home/Roseland', 'Harvard']],
  },
  {
    label: 'Positioning',
    tags: ['Sitting', 'Standing', 'Left hand', 'Right hand', 'Arm rested on surface'],
    exclusive: [['Sitting', 'Standing'], ['Left hand', 'Right hand']],
  },
  {
    label: 'Nutrition',
    tags: ['Pre-breakfast', 'Post-breakfast', 'Pre-lunch', 'Post-lunch', 'Pre-dunch', 'Post-dunch', 'Pre-dinner', 'Post-dinner'],
    exclusive: [
      ['Pre-breakfast', 'Post-breakfast'],
      ['Pre-lunch', 'Post-lunch'],
      ['Pre-dunch', 'Post-dunch'],
      ['Pre-dinner', 'Post-dinner'],
    ],
  },
  {
    label: 'Supplements',
    tags: ['Caffeine'],
    exclusive: [],
  },
]

const EEG_FILENAME_RE = /^\d{8}_(pre|post)-boxing_[a-f0-9]{16}\.csv$/i

// ── Shared style tokens ────────────────────────────────────────────────────────

const S = {
  bg: '#0f0f0f',
  card: '#161616',
  border: '#222222',
  accent: '#f5f5f5',
  dim: '#4b5563',
  input: {
    background: '#111111',
    border: '1px solid #262626',
    color: '#f5f5f5',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: '5px',
  },
  btn: {
    primary: {
      background: '#f5f5f5',
      color: '#080808',
      border: 'none',
      borderRadius: '6px',
      padding: '9px 18px',
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    secondary: {
      background: 'transparent',
      color: '#6b7280',
      border: '1px solid #262626',
      borderRadius: '6px',
      padding: '9px 18px',
      fontSize: '13px',
      cursor: 'pointer',
    },
  },
}

// ── Password step ──────────────────────────────────────────────────────────────

function PasswordStep({ onSuccess }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('password', pw)
      const res = await fetch(`${API}/api/log/auth`, { method: 'POST', body: fd })
      if (res.ok) {
        onSuccess(pw)
      } else {
        setError('Incorrect password.')
      }
    } catch {
      setError('Could not reach server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={S.label}>Password</label>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Enter log password"
          autoFocus
          style={S.input}
        />
        {error && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{error}</p>}
      </div>
      <button type="submit" disabled={loading || !pw} style={{ ...S.btn.primary, opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Checking…' : 'Enter'}
      </button>
    </form>
  )
}

// ── Tag checkboxes ─────────────────────────────────────────────────────────────

function TagPicker({ selected, onChange }) {
  function toggle(tag, exclusives) {
    let next = new Set(selected)
    if (next.has(tag)) {
      next.delete(tag)
    } else {
      // Remove mutually exclusive tags
      for (const group of exclusives) {
        if (group.includes(tag)) {
          group.forEach(t => next.delete(t))
        }
      }
      next.add(tag)
    }
    onChange([...next])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {TAG_GROUPS.map(group => (
        <div key={group.label}>
          <p style={{ ...S.label, marginBottom: '6px' }}>{group.label}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {group.tags.map(tag => {
              const on = selected.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag, group.exclusive)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    border: on ? '1px solid #f5f5f5' : '1px solid #262626',
                    background: on ? '#f5f5f510' : 'transparent',
                    color: on ? '#f5f5f5' : '#6b7280',
                    fontWeight: on ? 600 : 400,
                    transition: 'all 0.1s',
                  }}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Pison log section ──────────────────────────────────────────────────────────

function PisonSection({ password }) {
  const today = new Date().toISOString().slice(0, 10)
  const nowTime = new Date().toTimeString().slice(0, 5)

  const [logDate, setLogDate] = useState(today)
  const [logTime, setLogTime] = useState(nowTime)
  const [readiness, setReadiness] = useState('')
  const [agilityScore, setAgilityScore] = useState('')
  const [agilityMs, setAgilityMs] = useState('')
  const [agilityAccuracy, setAgilityAccuracy] = useState('')
  const [tags, setTags] = useState([])
  const [status, setStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [errMsg, setErrMsg] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!readiness && !agilityScore && !agilityMs && !agilityAccuracy) {
      setErrMsg('Enter at least one score.')
      return
    }
    setStatus('loading')
    setErrMsg('')
    try {
      const fd = new FormData()
      fd.append('password', password)
      fd.append('log_date', logDate)
      fd.append('log_time', logTime)
      if (readiness) fd.append('readiness_ms', readiness)
      if (agilityScore) fd.append('agility_score', agilityScore)
      if (agilityMs) fd.append('agility_ms', agilityMs)
      if (agilityAccuracy) fd.append('agility_accuracy', agilityAccuracy)
      fd.append('tags', tags.join(', '))

      const res = await fetch(`${API}/api/pison/log`, { method: 'POST', body: fd })
      if (res.ok) {
        setStatus('ok')
        setReadiness('')
        setAgilityScore('')
        setAgilityMs('')
        setAgilityAccuracy('')
        setTags([])
      } else {
        const j = await res.json().catch(() => ({}))
        setErrMsg(j.detail || 'Server error.')
        setStatus('error')
      }
    } catch {
      setErrMsg('Could not reach server.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Date + Time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={S.label}>Date</label>
          <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} style={S.input} />
        </div>
        <div>
          <label style={S.label}>Time</label>
          <input type="time" value={logTime} onChange={e => setLogTime(e.target.value)} style={S.input} />
        </div>
      </div>

      {/* Scores */}
      <div>
        <p style={{ ...S.label, marginBottom: '8px' }}>Readiness</p>
        <div>
          <label style={S.label}>Reaction Time (ms)</label>
          <input
            type="number"
            value={readiness}
            onChange={e => setReadiness(e.target.value)}
            placeholder="e.g. 134"
            min="0"
            step="0.1"
            style={S.input}
          />
          <p style={{ fontSize: '10px', color: '#374151', marginTop: '3px' }}>Lower = better</p>
        </div>
      </div>

      <div>
        <p style={{ ...S.label, marginBottom: '8px' }}>Agility (Go/No-Go)</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div>
            <label style={S.label}>Score (/100)</label>
            <input
              type="number"
              value={agilityScore}
              onChange={e => setAgilityScore(e.target.value)}
              placeholder="e.g. 78"
              min="0"
              max="100"
              step="0.1"
              style={S.input}
            />
          </div>
          <div>
            <label style={S.label}>Time (ms)</label>
            <input
              type="number"
              value={agilityMs}
              onChange={e => setAgilityMs(e.target.value)}
              placeholder="e.g. 210"
              min="0"
              step="0.1"
              style={S.input}
            />
          </div>
          <div>
            <label style={S.label}>Accuracy (%)</label>
            <input
              type="number"
              value={agilityAccuracy}
              onChange={e => setAgilityAccuracy(e.target.value)}
              placeholder="e.g. 95"
              min="0"
              max="100"
              step="0.1"
              style={S.input}
            />
          </div>
        </div>
        <p style={{ fontSize: '10px', color: '#374151', marginTop: '3px' }}>Higher score/accuracy = better · lower time = better</p>
      </div>

      {/* Tags */}
      <div>
        <label style={S.label}>Tags</label>
        <TagPicker selected={tags} onChange={setTags} />
      </div>

      {errMsg && <p style={{ color: '#ef4444', fontSize: '12px' }}>{errMsg}</p>}
      {status === 'ok' && (
        <p style={{ color: '#22c55e', fontSize: '12px' }}>Logged successfully.</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        style={{ ...S.btn.primary, opacity: status === 'loading' ? 0.6 : 1 }}
      >
        {status === 'loading' ? 'Saving…' : 'Save Pison Reading'}
      </button>
    </form>
  )
}

// ── Survey log section ─────────────────────────────────────────────────────────

function SurveySection({ password }) {
  const today = new Date().toISOString().slice(0, 10)

  const [logDate, setLogDate] = useState(today)
  const [trained, setTrained] = useState(0)
  const [sparred, setSparred] = useState(0)
  const [fought, setFought] = useState(0)
  const [headContact, setHeadContact] = useState('None')
  const [headache, setHeadache] = useState(0)
  const [creatine, setCreatine] = useState(0)
  const [caffeine, setCaffeine] = useState('')
  const [endurance, setEndurance] = useState('')
  const [status, setStatus] = useState(null)
  const [errMsg, setErrMsg] = useState('')

  async function submit(e) {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')
    try {
      const fd = new FormData()
      fd.append('password', password)
      fd.append('log_date', logDate)
      fd.append('trained', trained)
      fd.append('sparred', sparred)
      fd.append('fought', fought)
      fd.append('head_contact_level', headContact)
      fd.append('headache', headache)
      fd.append('creatine', creatine)
      if (caffeine !== '') fd.append('caffeine', caffeine)
      if (endurance !== '') fd.append('endurance', endurance)

      const res = await fetch(`${API}/api/survey/log`, { method: 'POST', body: fd })
      if (res.ok) {
        setStatus('ok')
      } else {
        const j = await res.json().catch(() => ({}))
        setErrMsg(j.detail || 'Server error.')
        setStatus('error')
      }
    } catch {
      setErrMsg('Could not reach server.')
      setStatus('error')
    }
  }

  function Toggle({ label, value, onChange }) {
    return (
      <div>
        <p style={S.label}>{label}</p>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[0, 1].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              style={{
                flex: 1, padding: '7px', borderRadius: '6px', border: 'none',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: value === v ? '#f5f5f5' : '#111111',
                color: value === v ? '#080808' : '#6b7280',
                transition: 'all 0.1s',
              }}
            >
              {v === 0 ? 'No' : 'Yes'}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={S.label}>Date</label>
        <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} style={S.input} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Toggle label="Trained" value={trained} onChange={setTrained} />
        <Toggle label="Sparred" value={sparred} onChange={setSparred} />
        <Toggle label="Fought" value={fought} onChange={setFought} />
        <Toggle label="Headache" value={headache} onChange={setHeadache} />
        <Toggle label="Creatine (5g)" value={creatine} onChange={setCreatine} />
      </div>

      <div>
        <p style={S.label}>Head Contact Level</p>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['None', 'Low', 'Medium', 'High'].map(lvl => (
            <button
              key={lvl}
              type="button"
              onClick={() => setHeadContact(lvl)}
              style={{
                flex: 1, padding: '7px', borderRadius: '6px', border: 'none',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                background: headContact === lvl ? '#f5f5f5' : '#111111',
                color: headContact === lvl ? '#080808' : '#6b7280',
                transition: 'all 0.1s',
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={S.label}>Caffeine (mg)</label>
          <input
            type="number"
            value={caffeine}
            onChange={e => setCaffeine(e.target.value)}
            placeholder="e.g. 200"
            min="0"
            step="1"
            style={S.input}
          />
        </div>
        <div>
          <label style={S.label}>Endurance (1–5)</label>
          <input
            type="number"
            value={endurance}
            onChange={e => setEndurance(e.target.value)}
            placeholder="e.g. 3"
            min="1"
            max="5"
            step="0.5"
            style={S.input}
          />
        </div>
      </div>

      {errMsg && <p style={{ color: '#ef4444', fontSize: '12px' }}>{errMsg}</p>}
      {status === 'ok' && <p style={{ color: '#22c55e', fontSize: '12px' }}>Survey logged successfully.</p>}

      <button
        type="submit"
        disabled={status === 'loading'}
        style={{ ...S.btn.primary, opacity: status === 'loading' ? 0.6 : 1 }}
      >
        {status === 'loading' ? 'Saving…' : 'Save Survey Entry'}
      </button>
    </form>
  )
}

// ── Neurable upload section ────────────────────────────────────────────────────

function NeurableSection({ password }) {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const inputRef = useRef()

  function parseFilename(name) {
    const m = name.match(/^(\d{2})(\d{2})(\d{4})_(pre|post)-boxing_([a-f0-9]{16})\.csv$/i)
    if (!m) return null
    return {
      date: `${m[3]}-${m[1]}-${m[2]}`,  // YYYY-MM-DD
      timing: m[4],
      id: m[5],
    }
  }

  function handleFiles(files) {
    const f = files[0]
    if (!f) return
    setErrMsg('')
    setStatus(null)
    if (!EEG_FILENAME_RE.test(f.name)) {
      setErrMsg(`Filename must match: MMDDYYYY_(pre|post)-boxing_<16hexchars>.csv`)
      setFile(null)
      return
    }
    setFile(f)
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [])

  async function upload(e) {
    e.preventDefault()
    if (!file) return
    setStatus('loading')
    setErrMsg('')
    try {
      const fd = new FormData()
      fd.append('password', password)
      fd.append('file', file, file.name)

      const res = await fetch(`${API}/api/eeg/upload`, { method: 'POST', body: fd })
      if (res.ok) {
        setStatus('ok')
        setFile(null)
      } else {
        const j = await res.json().catch(() => ({}))
        setErrMsg(j.detail || 'Upload failed.')
        setStatus('error')
      }
    } catch {
      setErrMsg('Could not reach server.')
      setStatus('error')
    }
  }

  const parsed = file ? parseFilename(file.name) : null

  return (
    <form onSubmit={upload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#f5f5f5' : '#262626'}`,
          borderRadius: '8px',
          padding: '32px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#ffffff08' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        {file ? (
          <div>
            <p style={{ color: '#f5f5f5', fontSize: '13px', fontWeight: 600, wordBreak: 'break-all' }}>{file.name}</p>
            {parsed && (
              <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '6px' }}>
                {parsed.date} · {parsed.timing}-boxing · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
        ) : (
          <div>
            <p style={{ color: '#6b7280', fontSize: '13px' }}>Drop EEG CSV here or click to browse</p>
            <p style={{ color: '#374151', fontSize: '11px', marginTop: '6px', fontFamily: 'monospace' }}>
              MMDDYYYY_(pre|post)-boxing_&lt;16hexchars&gt;.csv
            </p>
          </div>
        )}
      </div>

      {errMsg && <p style={{ color: '#ef4444', fontSize: '12px' }}>{errMsg}</p>}
      {status === 'ok' && (
        <p style={{ color: '#22c55e', fontSize: '12px' }}>File uploaded to neurable/data/</p>
      )}

      <button
        type="submit"
        disabled={!file || status === 'loading'}
        style={{ ...S.btn.primary, opacity: !file || status === 'loading' ? 0.4 : 1 }}
      >
        {status === 'loading' ? 'Uploading…' : 'Upload EEG File'}
      </button>
    </form>
  )
}

// ── Modal shell ────────────────────────────────────────────────────────────────

export default function LogModal({ onClose }) {
  const [password, setPassword] = useState(null)
  const [tab, setTab] = useState('survey') // 'survey' | 'pison' | 'neurable'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: S.bg,
          border: `1px solid ${S.border}`,
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f5f5f5', margin: 0 }}>Session Log</h2>
            {password && (
              <p style={{ fontSize: '11px', color: '#374151', marginTop: '3px' }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {!password ? (
          <PasswordStep onSuccess={pw => setPassword(pw)} />
        ) : (
          <>
            {/* Tab switcher */}
            <div
              style={{
                display: 'flex', gap: '4px', marginBottom: '24px',
                background: '#111111', padding: '4px', borderRadius: '8px',
              }}
            >
              {[['survey', 'Survey'], ['pison', 'Pison'], ['neurable', 'Neurable EEG']].map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: '7px', borderRadius: '6px', border: 'none',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    background: tab === t ? '#f5f5f5' : 'transparent',
                    color: tab === t ? '#080808' : '#6b7280',
                    transition: 'all 0.1s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'survey' && <SurveySection password={password} />}
            {tab === 'pison' && <PisonSection password={password} />}
            {tab === 'neurable' && <NeurableSection password={password} />}
          </>
        )}
      </div>
    </div>
  )
}
