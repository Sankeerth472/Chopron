import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/app-shell'
import { AuthGate } from './components/auth-gate'
import { ApplicationsDashboardPage } from './pages/applications-dashboard-page'
import { DashboardPage } from './pages/dashboard-page'
import { JobsPage } from './pages/jobs-page'

function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/dashboard" element={<ApplicationsDashboardPage />} />
          <Route path="/jobs" element={<JobsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthGate>
  )
}

export default App
