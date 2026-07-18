import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BriefcaseBusiness, ChevronLeft, ChevronRight, Filter, SearchX } from 'lucide-react'
import { fetchJobs, getMyJobs, getMyProfile, updateJobStatus } from '../lib/api'
import { getOrCreateActiveFlowId } from '../lib/request-context'
import { JobCard } from '../components/job-card'
import { JobDetailDrawer } from '../components/job-detail-drawer'
import { JobFilters, type JobFiltersState } from '../components/job-filters'
import { JobsSkeleton } from '../components/loading-skeletons'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { toast } from 'sonner'

const EMPTY_JOBS: Array<(Awaited<ReturnType<typeof getMyJobs>>)['jobs'][number]> = []

const defaultFilters: JobFiltersState = {
  query: '',
  applyPriority: 'ALL',
  recommendation: 'ALL',
  source: 'ALL',
  minFitScore: '',
}

const PAGE_SIZE = 12
const APPLY_EXIT_DELAY_MS = 280

export function JobsPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<JobFiltersState>(defaultFilters)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [leavingJobIds, setLeavingJobIds] = useState<number[]>([])
  const [hiddenJobIds, setHiddenJobIds] = useState<number[]>([])
  const jobElementRefs = useRef(new Map<number, HTMLDivElement>())
  const previousPositionsRef = useRef(new Map<number, DOMRect>())
  const leaveTimersRef = useRef(new Map<number, number>())
  const profileQuery = useQuery({
    queryKey: ['latest-profile'],
    queryFn: getMyProfile,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const jobsQuery = useQuery({
    queryKey: ['jobs', page, PAGE_SIZE],
    queryFn: () => getMyJobs(PAGE_SIZE, page * PAGE_SIZE),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  })

  const jobs = jobsQuery.data?.jobs ?? EMPTY_JOBS
  const totalJobs = jobsQuery.data?.total_count ?? jobs.length
  const totalPages = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE))
  const applyMutation = useMutation({
    mutationFn: ({ jobId, status }: { jobId: number; status: 'saved' | 'applied' }) => updateJobStatus(jobId, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs-summary'] })
      queryClient.invalidateQueries({ queryKey: ['applied-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job-detail', variables.jobId] })
      toast.success(variables.status === 'applied' ? 'Job marked as applied.' : 'Job saved for later.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update job status.')
    },
  })
  const fetchJobsMutation = useMutation({
    mutationFn: (profileId?: number) => fetchJobs({ profileId, limit: 25, flowId: getOrCreateActiveFlowId() }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs-summary'] })
      toast.success(`Matching jobs refreshed. ${result.jobs.length} jobs returned.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch jobs.')
    },
  })
  const sources = useMemo(() => Array.from(new Set(jobs.map((job) => job.source).filter(Boolean))).sort(), [jobs])

  function handleFiltersChange(next: JobFiltersState) {
    setFilters(next)
    setPage(0)
  }

  const filteredJobs = useMemo(() => {
    const searchTerm = filters.query.trim().toLowerCase()
    const minFit = filters.minFitScore ? Number(filters.minFitScore) : null

    return [...jobs]
      .filter((job) => {
        if (filters.applyPriority !== 'ALL' && job.apply_priority !== filters.applyPriority) return false
        if (filters.recommendation !== 'ALL' && job.apply_recommendation !== filters.recommendation) return false
        if (filters.source !== 'ALL' && job.source !== filters.source) return false
        if (minFit !== null && (job.candidate_fit_score ?? -1) < minFit) return false
        if (!searchTerm) return true

        return [job.title, job.company]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(searchTerm))
      })
  }, [filters, jobs])

  const visibleJobs = useMemo(
    () => filteredJobs.filter((job) => !hiddenJobIds.includes(job.id)),
    [filteredJobs, hiddenJobIds],
  )

  useEffect(() => {
    setHiddenJobIds((current) => current.filter((jobId) => jobs.some((job) => job.id === jobId)))
    setLeavingJobIds((current) => current.filter((jobId) => jobs.some((job) => job.id === jobId)))
  }, [jobs])

  useEffect(() => {
    return () => {
      for (const timerId of leaveTimersRef.current.values()) {
        window.clearTimeout(timerId)
      }
      leaveTimersRef.current.clear()
    }
  }, [])

  useLayoutEffect(() => {
    const nextPositions = new Map<number, DOMRect>()

    for (const job of visibleJobs) {
      const element = jobElementRefs.current.get(job.id)
      if (!element) continue

      const nextRect = element.getBoundingClientRect()
      nextPositions.set(job.id, nextRect)

      const previousRect = previousPositionsRef.current.get(job.id)
      if (!previousRect) continue

      const deltaX = previousRect.left - nextRect.left
      const deltaY = previousRect.top - nextRect.top
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 360,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      )
    }

    previousPositionsRef.current = nextPositions
  }, [visibleJobs])

  function setJobElementRef(jobId: number, element: HTMLDivElement | null) {
    if (element) {
      jobElementRefs.current.set(jobId, element)
      return
    }
    jobElementRefs.current.delete(jobId)
  }

  async function handleToggleApplied(jobId: number, nextValue: boolean) {
    if (!nextValue) {
      await applyMutation.mutateAsync({ jobId, status: 'saved' })
      return
    }

    if (leavingJobIds.includes(jobId) || applyMutation.isPending) {
      return
    }

    setLeavingJobIds((current) => [...current, jobId])

    const timerId = window.setTimeout(async () => {
      leaveTimersRef.current.delete(jobId)
      setHiddenJobIds((current) => [...current, jobId])

      try {
        await applyMutation.mutateAsync({ jobId, status: 'applied' })
      } catch {
        setHiddenJobIds((current) => current.filter((id) => id !== jobId))
      } finally {
        setLeavingJobIds((current) => current.filter((id) => id !== jobId))
      }
    }, APPLY_EXIT_DELAY_MS)

    leaveTimersRef.current.set(jobId, timerId)
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[32px] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/80 p-6 sm:p-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-300">Saved Opportunities</p>
            <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-white">Jobs ranked for fit and application priority.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              Search by title or company, filter by recommendation or source, and open any role for a deeper fit breakdown.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">{totalJobs} total</Badge>
              <Badge variant="success">{jobs.filter((job) => job.apply_recommendation === 'APPLY').length} apply</Badge>
            </div>
            <Button
              size="lg"
              onClick={() => fetchJobsMutation.mutate(profileQuery.data?.profile_id)}
              disabled={fetchJobsMutation.isPending || profileQuery.isLoading || !profileQuery.data}
            >
              {fetchJobsMutation.isPending ? 'Fetching jobs...' : 'Find Matching Jobs'}
            </Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat label="Fetched" value={String(fetchJobsMutation.data?.fetched_count ?? jobs.length)} />
          <Stat label="Deduplicated" value={String(fetchJobsMutation.data?.deduplicated_count ?? jobs.length)} />
          <Stat label="Passed" value={String(fetchJobsMutation.data?.passed_count ?? jobs.filter((job) => job.apply_recommendation !== 'REVIEW').length)} />
          <Stat label="Updated" value={String(fetchJobsMutation.data?.updated_count ?? 0)} />
        </div>
        <JobFilters filters={filters} sources={sources} onChange={handleFiltersChange} />
      </section>

      {jobsQuery.isLoading ? (
        <JobsSkeleton />
      ) : jobsQuery.isError ? (
        <Card className="p-6 text-sm text-rose-700 dark:text-rose-200">
          {jobsQuery.error instanceof Error ? jobsQuery.error.message : 'Failed to load jobs.'}
        </Card>
      ) : visibleJobs.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {jobs.length === 0 ? <BriefcaseBusiness className="h-7 w-7" /> : <SearchX className="h-7 w-7" />}
          </div>
          <p className="mt-5 font-display text-2xl font-bold text-slate-950 dark:text-white">
            {jobs.length === 0 ? 'No jobs saved yet' : 'No jobs match these filters'}
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
            {jobs.length === 0
              ? 'Use Find Matching Jobs here after uploading a resume.'
              : 'Adjust search, source, priority, or minimum fit score filters.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <Filter className="h-4 w-4" />
            Showing {visibleJobs.length} of {jobs.length} jobs on page {page + 1}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleJobs.map((job) => (
              <div
                key={job.id}
                ref={(element) => setJobElementRef(job.id, element)}
                data-state={leavingJobIds.includes(job.id) ? 'leaving' : 'idle'}
                className="job-card-shell"
              >
                <JobCard
                  job={job}
                  onOpen={setSelectedJobId}
                  onToggleApplied={handleToggleApplied}
                  isUpdating={applyMutation.isPending || leavingJobIds.includes(job.id)}
                />
              </div>
            ))}
          </div>
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Page {page + 1} of {totalPages}. Showing jobs {Math.min(page * PAGE_SIZE + 1, totalJobs)} to {Math.min(page * PAGE_SIZE + jobs.length, totalJobs)} of {totalJobs}.
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || jobsQuery.isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPage((current) => current + 1)}
                disabled={!jobsQuery.data?.has_more || jobsQuery.isFetching}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </Card>
        </>
      )}

      <JobDetailDrawer jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
    </div>
  )
}
