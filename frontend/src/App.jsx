import { Routes, Route } from 'react-router-dom'
import Home from './routes/Home'
import Privacy from './routes/Privacy'
import Dashboard from './components/Dashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/results"   element={<Dashboard />} />
      <Route path="/privacy"   element={<Privacy />} />
      {/* Legacy routes — redirect to /results */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/neurable"  element={<Dashboard />} />
      <Route path="/pison"     element={<Dashboard />} />
      <Route path="/whoop"     element={<Dashboard />} />
      <Route path="/oura"      element={<Dashboard />} />
    </Routes>
  )
}
