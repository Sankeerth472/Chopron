import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BriefcaseBusiness, CalendarClock, CircleCheckBig, Radar, Sparkles } from 'lucide-react'
import { getAppliedJobs } from '../lib/api'
import { formatDate, formatScore, toTitleCase } from '../lib/format'
import { JobDetailDrawer } from '../components/job-detail-drawer'
import { MetricCard } from '../components/metric-card'
import { JobsSkeleton } from '../components/loading-skeletons'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'

const EMPTY_APPLIED: Array<(Awaited<ReturnType<typeof getAppliedJobs>>)['jobs'][number]> = []

export function ApplicationsDashboardPage() {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const appliedJobsQuery = useQuery({
    queryKey: ['applied-jobs'],
    queryFn: () => getAppliedJobs(100),
    staleTime: 60_000,
  })

  const appliedJobs = useMemo(
    () =>
      [...(appliedJobsQuery.data?.jobs ?? EMPTY_APPLIED)].sort((left, right) =>
        String(right.applied_at ?? '').localeCompare(String(left.applied_at ?? '')),
      ),
    [appliedJobsQuery.data?.jobs],
  )

  const metrics = useMemo(() => {
    const applyNow = appliedJobs.filter((job) => job.apply_recommendation === 'APPLY').length
    const avgFit =
      appliedJobs.length > 0
        ? Math.round(appliedJobs.reduce((sum, job) => sum + (job.candidate_fit_score ?? 0), 0) / appliedJobs.length)
        : null
    const recentApplied = appliedJobs.filter((job) => job.applied_at).slice(0, 5).length
    return { applyNow, avgFit, recentApplied }
  }, [appliedJobs])

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/85 p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-300">Dashboard</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-white">Track the jobs you already applied to.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          This dashboard is your applications workspace. Mark a role as applied from the Jobs view and it lands here with fit score, company, recommendation, and applied date.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Applied Jobs" value={appliedJobs.length} detail="Total roles you have marked as submitted." icon={CircleCheckBig} />
        <MetricCard label="High Intent" value={metrics.applyNow} detail="Applied jobs that were rated as strong apply candidates." icon={Sparkles} />
        <MetricCard label="Average Fit" value={formatScore(metrics.avgFit)} detail="Average fit score across your submitted applications." icon={Radar} />
        <MetricCard label="Recently Marked" value={metrics.recentApplied} detail="Recently applied roles visible in this dashboard." icon={CalendarClock} />
      </section>

      {appliedJobsQuery.isLoading ? (
        <JobsSkeleton />
      ) : appliedJobsQuery.isError ? (
        <Card className="p-6 text-sm text-rose-700 dark:text-rose-200">
          {appliedJobsQuery.error instanceof Error ? appliedJobsQuery.error.message : 'Failed to load applied jobs.'}
        </Card>
      ) : appliedJobs.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <BriefcaseBusiness className="h-7 w-7" />
          </div>
          <p className="mt-5 font-display text-2xl font-bold text-slate-950 dark:text-white">No applications tracked yet</p>
          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
            Go to the Jobs page and mark a job as applied. It will appear here automatically.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {appliedJobs.map((job) => (
            <Card key={job.id} className="p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-display text-2xl font-bold text-slate-950 dark:text-white">{job.title}</p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{job.company} • {job.location || 'Location unavailable'}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="success">Applied</Badge>
                    <Badge variant="accent">{toTitleCase(job.source)}</Badge>
                    <Badge variant="warning">{toTitleCase(job.apply_priority)}</Badge>
                  </div>
                </div>
                <div className="rounded-[24px] bg-slate-50 p-4 text-right dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Applied on</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">{formatDate(job.applied_at)}</p>
                  <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{formatScore(job.candidate_fit_score)}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setSelectedJobId(job.id)}>Open analysis</Button>
                {job.url ? (
                  <Button asChild>
                    <a href={job.url} target="_blank" rel="noreferrer">Open job link</a>
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <JobDetailDrawer jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
    </div>
  )
}
