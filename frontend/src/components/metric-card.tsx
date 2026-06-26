import type { LucideIcon } from 'lucide-react'
import { Card } from './ui/card'

type MetricCardProps = {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
}

export function MetricCard({ label, value, detail, icon: Icon }: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-4 font-display text-4xl font-bold text-slate-950 dark:text-white">{value}</p>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}
