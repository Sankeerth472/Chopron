import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BriefcaseBusiness, Radar, Sparkles, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, fetchJobs, getBackendHealth, getMyJobs, getMyProfile } from '../lib/api'
import { formatScore } from '../lib/format'
import { getOrCreateActiveFlowId } from '../lib/request-context'
import type { ProfileResponse } from '../types/api'
import { BackendStatusCard } from '../components/backend-status-card'
import { MetricCard } from '../components/metric-card'
import { ProfileSummary } from '../components/profile-summary'
import { UploadResumeCard } from '../components/upload-resume-card'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { DashboardSkeleton } from '../components/loading-skeletons'

const EMPTY_JOBS: Array<(Awaited<ReturnType<typeof getMyJobs>>)['jobs'][number]> = []

export function DashboardPage() {
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: ['latest-profile'],
    queryFn: getMyProfile,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const healthQuery = useQuery({
    queryKey: ['backend-health'],
    queryFn: getBackendHealth,
    retry: false,
    staleTime: 30_000,
  })

  const jobsQuery = useQuery({
    queryKey: ['jobs-summary'],
    queryFn: () => getMyJobs(100),
    staleTime: 60_000,
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

  function handleUpload(profile: ProfileResponse) {
    queryClient.setQueryData(['latest-profile'], profile)
    queryClient.invalidateQueries({ queryKey: ['jobs'] })
    queryClient.invalidateQueries({ queryKey: ['jobs-summary'] })
  }

  const hasNoProfile = profileQuery.isError && errorIsMissingProfile(profileQuery.error)
  const backendOffline = healthQuery.isError
  const profile = profileQuery.data
  const jobs = jobsQuery.data?.jobs ?? EMPTY_JOBS

  const metrics = useMemo(() => {
    const totalJobs = jobs.length
    const highPriority = jobs.filter((job) => job.apply_priority === 'HIGH').length
    const readyToApply = jobs.filter((job) => ['APPLY', 'MAYBE'].includes(job.apply_recommendation)).length
    const averageFitScore = jobs.filter((job) => job.candidate_fit_score !== null)
    const avgFit =
      averageFitScore.length > 0
        ? Math.round(
            averageFitScore.reduce((total, job) => total + (job.candidate_fit_score ?? 0), 0) / averageFitScore.length,
          )
        : null

    return {
      totalJobs,
      highPriority,
      readyToApply,
      avgFit,
    }
  }, [jobs])

  if (profileQuery.isLoading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-[color:var(--color-border)] bg-slate-950 px-6 py-7 text-white sm:px-8 sm:py-9">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.22),transparent_55%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Job Search AI Dashboard
            </p>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Turn one resume into a prioritized pipeline of jobs you should actually pursue.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Upload your resume, let Chopron build a candidate profile, fetch matching roles, and review fit and application guidance before you spend time applying.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
              <span>Upload resume</span>
              <ArrowRight className="h-4 w-4" />
              <span>AI profile</span>
              <ArrowRight className="h-4 w-4" />
              <span>Matching jobs</span>
              <ArrowRight className="h-4 w-4" />
              <span>Fit analysis</span>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/12 bg-white/8 p-6 backdrop-blur">
            <p className="text-sm font-semibold text-teal-200">Next step</p>
            <p className="mt-3 font-display text-2xl font-bold">
              {profile ? 'Refresh your matching jobs' : 'Upload a resume to start'}
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {profile
                ? 'Use the fetch action after profile upload whenever you want to refresh the pipeline against current openings.'
                : 'The dashboard stays empty until a candidate profile exists. Resume upload is the first dependency for every downstream view.'}
            </p>
          </div>
        </div>
      </section>

      <BackendStatusCard
        state={backendOffline ? 'offline' : healthQuery.isLoading ? 'checking' : 'online'}
        message={
          backendOffline
            ? healthQuery.error instanceof Error
              ? healthQuery.error.message
              : 'Backend unavailable.'
            : 'Frontend is connected to the FastAPI backend. Resume upload, latest profile loading, job fetch, and detail retrieval are available.'
        }
        onRetry={() => {
          healthQuery.refetch()
          profileQuery.refetch()
          jobsQuery.refetch()
        }}
      />

      {hasNoProfile ? (
        <UploadResumeCard
          onUploaded={handleUpload}
          disabled={backendOffline}
          helperText={
            backendOffline
              ? 'The backend is not running on http://localhost:8000 yet.'
              : 'No saved profile found. Upload a PDF resume to create one.'
          }
        />
      ) : profile ? (
        <>
          <ProfileSummary profile={profile} />

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total Jobs" value={metrics.totalJobs} detail="Current saved opportunities across sources." icon={BriefcaseBusiness} />
            <MetricCard label="High Priority" value={metrics.highPriority} detail="Roles the screener ranked as strongest opportunities." icon={Sparkles} />
            <MetricCard label="Apply / Maybe" value={metrics.readyToApply} detail="Jobs with the clearest near-term application path." icon={TrendingUp} />
            <MetricCard label="Average Fit" value={formatScore(metrics.avgFit)} detail="Average AI fit score for jobs that were evaluated." icon={Radar} />
          </section>

          <Card className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-display text-2xl font-bold text-slate-950 dark:text-white">Find Matching Jobs</p>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                  Trigger the backend job ingestion and screening pipeline, then refresh the saved jobs list in the UI.
                </p>
              </div>
              <Button size="lg" onClick={() => fetchJobsMutation.mutate(profile.profile_id)} disabled={fetchJobsMutation.isPending}>
                {fetchJobsMutation.isPending ? 'Fetching jobs...' : 'Find Matching Jobs'}
              </Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Fetched" value={String(fetchJobsMutation.data?.fetched_count ?? jobs.length)} />
              <Stat label="Deduplicated" value={String(fetchJobsMutation.data?.deduplicated_count ?? jobs.length)} />
              <Stat label="Passed" value={String(fetchJobsMutation.data?.passed_count ?? jobs.filter((job) => job.apply_recommendation !== 'REVIEW').length)} />
              <Stat label="Updated" value={String(fetchJobsMutation.data?.updated_count ?? 0)} />
            </div>
          </Card>

          <UploadResumeCard onUploaded={handleUpload} disabled={backendOffline} helperText={backendOffline ? 'Backend unavailable. Resume upload is temporarily disabled.' : undefined} />
        </>
      ) : (
        <div className="space-y-6">
          <Card className="p-6 text-sm text-slate-600 dark:text-slate-300">
            Failed to load the latest profile. {profileQuery.error instanceof Error ? profileQuery.error.message : 'Please try again.'}
          </Card>
          <UploadResumeCard
            onUploaded={handleUpload}
            disabled={backendOffline}
            helperText={
              backendOffline
                ? 'Start the FastAPI backend first, then retry and upload your PDF resume.'
                : 'If no profile exists yet, upload a PDF resume here.'
            }
          />
        </div>
      )}
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

function errorIsMissingProfile(error: unknown) {
  return error instanceof ApiError && error.status === 404
}
