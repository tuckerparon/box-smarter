/**
 * Fetches all dashboard data in parallel.
 * All four brand views consume this same hook.
 */
import { useState, useEffect } from 'react'

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
      fetchJson(endpoint('analysis/longitudinal')),
      fetchJson(endpoint('analysis/correlation-matrix')),
    ])
      .then(([abSparring, longitudinal, correlationMatrix]) => {
        setData({ abSparring, longitudinal, correlationMatrix })
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
