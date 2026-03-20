/**
 * Brand theme tokens derived from each wearable's native app UI.
 * All dashboards show identical data — only styling differs.
 */
export const THEMES = {
  whoop: {
    name: 'WHOOP',
    bg: '#111111',
    cardBg: '#1a1a1a',
    border: '#262626',
    accent: '#22c55e',      // green-500 — recovery (WHOOP green, toned down)
    accent2: '#a16207',     // amber-700 — strain (warm, not neon yellow)
    accent3: '#3b82f6',     // blue-500 — sleep
    text: '#f5f5f5',
    subtext: '#737373',
    dimText: '#404040',
    logo: '/logos/whoop_logo.jpg',
    fontFamily: 'Inter, system-ui, sans-serif',
  },

  neurable: {
    name: 'Neurable',
    bg: '#141414',
    cardBg: '#1c1c24',
    border: '#26263a',
    accent: '#7c3aed',      // violet-700 — slightly deeper than before
    accent2: '#8b5cf6',     // violet-500
    accent3: '#4f46e5',     // indigo-600
    text: '#f5f5f5',
    subtext: '#737373',
    dimText: '#404040',
    logo: '/logos/neurable_logo.png',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  },

  pison: {
    name: 'Pison',
    bg: '#0f1520',
    cardBg: '#161e2e',
    border: '#1e2a3e',
    accent: '#0d9488',      // teal-600 — brand primary, much less neon
    accent2: '#0891b2',     // cyan-600
    accent3: '#0369a1',     // sky-700
    text: '#f1f5f9',
    subtext: '#64748b',
    dimText: '#334155',
    logo: '/logos/pison_logo.webp',
    fontFamily: 'Inter, system-ui, sans-serif',
  },

  oura: {
    name: 'Oura',
    bg: '#0d1117',
    cardBg: '#161b22',
    border: '#21262d',
    accent: '#b8973c',      // gold — slightly more muted than before
    accent2: '#a07c2c',     // deeper gold
    accent3: '#5f9ea0',     // cadet blue — activity
    text: '#e6edf3',
    subtext: '#7d8590',
    dimText: '#484f58',
    logo: '/logos/oura_logo.png',
    fontFamily: 'Sora, system-ui, sans-serif',
  },
}
