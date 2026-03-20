/**
 * Fetches all dashboard data in parallel.
 * All four brand views consume this same hook.
 */
import { useState, useEffect } from 'react'

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api'

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
      fetchJson(`${BASE}/analysis/ab-sparring`),
      fetchJson(`${BASE}/analysis/pre-post-delta`),
      fetchJson(`${BASE}/analysis/longitudinal`),
      fetchJson(`${BASE}/analysis/neuroprotective`),
      fetchJson(`${BASE}/analysis/recommendation`),
    ])
      .then(([abSparring, prePostDelta, longitudinal, neuroprotective, recommendation]) => {
        setData({ abSparring, prePostDelta, longitudinal, neuroprotective, recommendation })
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
