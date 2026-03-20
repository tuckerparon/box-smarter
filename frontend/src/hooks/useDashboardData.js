/**
 * Fetches all dashboard data in parallel.
 * All four brand views consume this same hook.
 */
import { useState, useEffect } from 'react'

// In production, pre-rendered static JSON is served from /static-api/*.json
// Locally, the live FastAPI server on :8000 is used instead.
const IS_STATIC = !import.meta.env.DEV && !import.meta.env.VITE_API_URL
const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL + '/api'
  : import.meta.env.DEV
    ? 'http://localhost:8000/api'
    : '/static-api'

function endpoint(path) {
  // path e.g. "analysis/ab-sparring"
  const slug = path.split('/').pop()
  return IS_STATIC ? `${BASE}/${slug}.json` : `${BASE}/${path}`
}

async function fetchJson(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

export function useDashboardData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetchJson(endpoint('analysis/ab-sparring')),
      fetchJson(endpoint('analysis/pre-post-delta')),
      fetchJson(endpoint('analysis/longitudinal')),
      fetchJson(endpoint('analysis/neuroprotective')),
      fetchJson(endpoint('analysis/recommendation')),
    ])
      .then(([abSparring, prePostDelta, longitudinal, neuroprotective, recommendation]) => {
        setData({ abSparring, prePostDelta, longitudinal, neuroprotective, recommendation })
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
