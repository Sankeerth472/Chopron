import { AlertTriangle, CheckCircle2, RotateCcw, ServerCrash } from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'

type BackendStatusCardProps = {
  state: 'online' | 'offline' | 'checking'
  message: string
  onRetry: () => void
}

export function BackendStatusCard({ state, message, onRetry }: BackendStatusCardProps) {
  const icon =
    state === 'online' ? (
      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
    ) : state === 'checking' ? (
      <AlertTriangle className="h-6 w-6 text-amber-600" />
    ) : (
      <ServerCrash className="h-6 w-6 text-rose-600" />
    )

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="mt-1">{icon}</div>
          <div>
            <p className="font-display text-2xl font-bold text-slate-950 dark:text-white">Backend connection</p>
            <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{message}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          Retry connection
        </Button>
      </div>
    </Card>
  )
}
