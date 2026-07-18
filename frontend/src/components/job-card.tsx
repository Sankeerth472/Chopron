import { ArrowUpRight, Building2, CalendarDays, CheckSquare, MapPin, Radar } from 'lucide-react'
import { formatDate, formatScore, toTitleCase } from '../lib/format'
import type { JobSummary } from '../types/api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'

type JobCardProps = {
  job: JobSummary
  onOpen: (jobId: number) => void
  onToggleApplied: (jobId: number, nextValue: boolean) => void
  isUpdating?: boolean
}

function priorityVariant(priority: string) {
  if (priority === 'HIGH') return 'success'
  if (priority === 'MEDIUM') return 'warning'
  return 'neutral'
}

function recommendationVariant(recommendation: string) {
  if (recommendation === 'APPLY') return 'success'
  if (recommendation === 'MAYBE') return 'accent'
  return 'neutral'
}

export function JobCard({ job, onOpen, onToggleApplied, isUpdating = false }: JobCardProps) {
  return (
    <Card className="group p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-xl font-bold text-slate-950 dark:text-white">{job.title}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              {job.company}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {job.location || 'Location unavailable'}
            </span>
          </div>
        </div>
        <Badge variant="accent">{toTitleCase(job.source)}</Badge>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge variant={priorityVariant(job.apply_priority)}>{toTitleCase(job.apply_priority)}</Badge>
        <Badge variant={recommendationVariant(job.apply_recommendation)}>{toTitleCase(job.apply_recommendation)}</Badge>
        {job.status === 'applied' ? <Badge variant="success">Applied</Badge> : null}
        {job.status === 'saved' ? <Badge variant="accent">Saved</Badge> : null}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fit Score</p>
          <p className="mt-2 text-lg font-bold text-slate-950 dark:text-white">{formatScore(job.candidate_fit_score)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Relevance</p>
          <p className="mt-2 text-lg font-bold text-slate-950 dark:text-white">{formatScore(job.relevance_score)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-400" />
          {job.remote ? 'Remote-friendly' : 'Location-specific role'}
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          Published {formatDate(job.publication_date)}
        </div>
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-slate-400" />
          Ranked for candidate match
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-teal-700"
            checked={job.status === 'applied'}
            disabled={isUpdating}
            onChange={(event) => onToggleApplied(job.id, event.target.checked)}
          />
          <CheckSquare className="h-4 w-4 text-teal-600" />
          Mark as applied
        </label>
        <Button variant="secondary" className="w-full justify-between" onClick={() => onOpen(job.id)}>
          Open analysis
          <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Button>
      </div>
    </Card>
  )
}
