import { useState, useEffect } from 'react'

/**
 * Simple data fetching hook.
 * @param {string} endpoint — e.g. '/api/eeg/longitudinal'
 */
export function useApi(endpoint) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!endpoint) return
    setLoading(true)
    fetch(endpoint)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [endpoint])

  return { data, loading, error }
}
