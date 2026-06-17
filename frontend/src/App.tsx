import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './components/Home'
import Dashboard from './components/Dashboard'
import NewIntegration from './components/NewIntegration'
import History from './components/History'

const USER_ID = 'default-user'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Routes>
        <Route path="/" element={<Home userId={USER_ID} />} />
        <Route path="/dashboard" element={<Dashboard userId={USER_ID} />} />
        <Route path="/new" element={<NewIntegration userId={USER_ID} />} />
        <Route path="/history" element={<History userId={USER_ID} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}
