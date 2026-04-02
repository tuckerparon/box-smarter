/**
 * Fetches all dashboard data in parallel.
 * All four brand views consume this same hook.
 */
import { useState, useEffect } from 'react'

// Dev: hit local FastAPI. Production: /api is proxied to Cloud Run via vercel.json.
const BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : '/api'

function endpoint(path) {
  return `${BASE}/${path}`
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
