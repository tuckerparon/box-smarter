import { Routes, Route } from 'react-router-dom'
import Home from './routes/Home'
import Pison from './routes/Pison'
import Neurable from './routes/Neurable'
import Whoop from './routes/Whoop'
import Oura from './routes/Oura'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pison" element={<Pison />} />
      <Route path="/neurable" element={<Neurable />} />
      <Route path="/whoop" element={<Whoop />} />
      <Route path="/oura" element={<Oura />} />
    </Routes>
  )
}
