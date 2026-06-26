import type { FormEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LockKeyhole, Sparkles } from 'lucide-react'
import { getCurrentUser, login, signup } from '../lib/api'
import { clearSession, getStoredSession, storeSession, type AuthSession } from '../lib/auth'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'

type AuthGateProps = {
  children: ReactNode
}

const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession())
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')

  const sessionQuery = useQuery({
    queryKey: ['current-user', session?.token],
    queryFn: async () => {
      const result = await getCurrentUser()
      const nextSession = {
        token: session!.token,
        user: result.user,
      }
      storeSession(nextSession)
      setSession(nextSession)
      return result
    },
    enabled: Boolean(session?.token),
    retry: false,
  })

  useEffect(() => {
    if (sessionQuery.isError) {
      clearSession()
      setSession(null)
    }
  }, [sessionQuery.isError])

  const authMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'signup') {
        return signup({
          email: email.trim(),
          password,
        })
      }

      return login({
        email: email.trim(),
        password,
      })
    },
    onSuccess: async (result) => {
      const nextSession = {
        token: result.token,
        user: result.user,
      }
      storeSession(nextSession)
      setSession(nextSession)
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Authentication failed.')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    if (!EMAIL_PATTERN.test(email.trim())) {
      setFormError('Enter a valid email address.')
      return
    }

    if (!password.trim()) {
      setFormError('Password cannot be empty.')
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }

    authMutation.mutate()
  }

  if (session && sessionQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-xl p-8 text-center text-sm text-slate-600 dark:text-slate-300">
          Validating your Chopron session...
        </Card>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-5xl overflow-hidden">
          <div className="grid min-h-[720px] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative overflow-hidden bg-slate-950 p-8 text-white sm:p-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.24),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_35%)]" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  Chopron Workspace
                </div>
                <h1 className="mt-8 max-w-xl font-display text-5xl font-bold leading-tight">
                  Sign in with a real email before you upload your resume and start the job pipeline.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-8 text-slate-300">
                  Each account owns its own resume profile, fetched jobs, saved jobs, and applied jobs inside the shared `chopron.db` database.
                </p>

                <div className="mt-10 grid gap-4">
                  {[
                    'Sign up or log in with email and password',
                    'Upload PDF resume to /profile/upload-resume',
                    'Load your own profile from /profile/me',
                    'Fetch and manage only your jobs from /jobs/me',
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center bg-white/70 p-8 sm:p-10 dark:bg-slate-950/70">
              <form className="w-full space-y-6" onSubmit={handleSubmit}>
                <div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                    <LockKeyhole className="h-7 w-7" />
                  </div>
                  <div className="mt-6 flex gap-2">
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}
                      onClick={() => {
                        setMode('login')
                        setFormError('')
                      }}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'signup' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}
                      onClick={() => {
                        setMode('signup')
                        setFormError('')
                      }}
                    >
                      Create account
                    </button>
                  </div>
                  <h2 className="mt-6 font-display text-3xl font-bold text-slate-950 dark:text-white">Enter the dashboard</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    Local auth is enabled here. Existing users load their own saved data, and new users are sent to resume upload before job fetching.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Email</label>
                    <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jane@example.com" type="email" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Password</label>
                    <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" type="password" />
                  </div>
                  {mode === 'signup' ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Confirm password</label>
                      <Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" type="password" />
                    </div>
                  ) : null}
                </div>

                {formError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                    {formError}
                  </div>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={authMutation.isPending}>
                  {authMutation.isPending ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in'}
                </Button>
              </form>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <>
      <SessionBridge session={session} />
      {children}
    </>
  )
}

function SessionBridge({ session }: { session: AuthSession }) {
  useEffect(() => {
    ;(window as Window & { __CHOPRON_SESSION__?: AuthSession | null }).__CHOPRON_SESSION__ = session
    return () => {
      ;(window as Window & { __CHOPRON_SESSION__?: AuthSession | null }).__CHOPRON_SESSION__ = null
    }
  }, [session])

  return null
}
