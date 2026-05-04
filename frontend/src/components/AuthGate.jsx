import { useState } from 'react'

const SESSION_KEY = 'site_unlocked'
const SITE_PASSWORD = import.meta.env.VITE_SITE_PASSWORD

export default function AuthGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return children

  function handleSubmit(e) {
    e.preventDefault()
    if (input === SITE_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1')
      setUnlocked(true)
    } else {
      setError(true)
      setInput('')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2]">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl">🥊</span>
          <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">BoxSmart</h1>
          <p className="text-sm text-gray-500 text-center">Enter the password to continue.</p>
        </div>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false) }}
            placeholder="Password"
            autoFocus
            className={`w-full border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 transition
              ${error ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-100'}`}
          />
          {error && <p className="text-xs text-red-500 -mt-1">Incorrect password.</p>}
          <button
            type="submit"
            className="w-full bg-[#1A1A1A] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-800 transition"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
