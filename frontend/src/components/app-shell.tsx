import { useState } from 'react'
import { BarChart3, Bot, BriefcaseBusiness, LogOut, Sparkles } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { getStoredSession, signOut } from '../lib/auth'
import { cn } from '../lib/utils'
import { AutofillPreferencesDialog } from './autofill-preferences-dialog'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/', label: 'Overview', icon: Sparkles },
  { to: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
]

export function AppShell() {
  const session = getStoredSession()
  const [isAutofillOpen, setIsAutofillOpen] = useState(false)

  return (
    <div className="h-screen overflow-hidden px-4 py-4 text-slate-900 sm:px-6 lg:px-8 dark:text-slate-50">
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-7xl gap-4 overflow-hidden">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-72 shrink-0 flex-col rounded-[32px] border border-[color:var(--color-border)] bg-slate-950 p-6 text-white shadow-[0_30px_70px_-35px_rgba(2,8,23,0.85)] lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 text-slate-950 shadow-lg shadow-teal-500/30">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-xl font-bold">Chopron</p>
              <p className="text-sm text-slate-400">AI Job Search Workspace</p>
            </div>
          </div>

          <div className="mt-10 space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition',
                    isActive ? 'bg-white/12 text-white' : 'text-slate-400 hover:bg-white/6 hover:text-white',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-400 transition hover:bg-white/6 hover:text-white"
              onClick={() => setIsAutofillOpen(true)}
            >
              <Bot className="h-4 w-4" />
              Autofill Info
            </button>
          </div>

          <div className="mt-auto rounded-[28px] border border-white/10 bg-white/6 p-5">
            <p className="font-display text-lg font-semibold">Pipeline</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Upload a resume, generate a candidate profile, fetch openings, then inspect fit analysis before you apply.
            </p>
            {session ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-sm font-semibold text-white">{session.user.email}</p>
                <p className="mt-1 text-xs text-slate-400">Authenticated session</p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300 transition hover:text-white"
                  onClick={signOut}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto rounded-[32px] border border-[color:var(--color-border)] bg-white/60 p-4 shadow-[0_28px_90px_-45px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-6 dark:bg-slate-950/45">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between rounded-[28px] border border-white/40 bg-white/65 px-5 py-4 shadow-sm backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/70">
              <div>
                <p className="font-display text-xl font-bold">Chopron</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">AI Job Search Workspace</p>
              </div>
              <div className="flex gap-2">
                {navItems.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'rounded-full px-4 py-2 text-sm font-medium',
                        isActive
                          ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200',
                      )
                    }
                  >
                    {label}
                  </NavLink>
                ))}
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  onClick={() => setIsAutofillOpen(true)}
                >
                  Autofill
                </button>
              </div>
            </div>
            <Outlet />
          </div>
        </main>
      </div>
      <AutofillPreferencesDialog open={isAutofillOpen} onOpenChange={setIsAutofillOpen} />
    </div>
  )
}
