import { Routes, Route, Navigate } from 'react-router-dom'
import Pison from './routes/Pison'
import Neurable from './routes/Neurable'
import Whoop from './routes/Whoop'
import Oura from './routes/Oura'

export default function App() {
  return (
    <Routes>
      <Route path="/pison" element={<Pison />} />
      <Route path="/neurable" element={<Neurable />} />
      <Route path="/whoop" element={<Whoop />} />
      <Route path="/oura" element={<Oura />} />
      {/* Default: redirect to Neurable as primary EEG view */}
      <Route path="*" element={<Navigate to="/neurable" replace />} />
    </Routes>
  )
}
