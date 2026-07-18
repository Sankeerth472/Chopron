import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CircleX,
  FileBadge2,
  LoaderCircle,
  MessageSquareQuote,
  Sparkles,
  Target,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getJobDetail } from '../lib/api'
import { asStringArray, formatDate, formatScore, toTitleCase } from '../lib/format'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

type JobDetailDrawerProps = {
  jobId: number | null
  onClose: () => void
}

function Section({ title, children, icon: Icon }: { title: string; children: ReactNode; icon: typeof Sparkles }) {
  return (
    <section className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Icon className="h-4 w-4 text-teal-600" />
        {title}
      </div>
      <div className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  )
}

export function JobDetailDrawer({ jobId, onClose }: JobDetailDrawerProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: () => getJobDetail(jobId!),
    enabled: jobId !== null,
  })

  return (
    <Dialog.Root open={jobId !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl outline-none sm:max-w-2xl sm:p-7 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-2xl font-bold text-slate-950 dark:text-white">
                {data?.title ?? 'Job analysis'}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {data ? `${data.company} • ${data.location || 'Location unavailable'} • ${formatDate(data.publication_date)}` : 'Loading job detail'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white">
                <CircleX className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {isLoading ? (
            <div className="flex min-h-[50vh] items-center justify-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-teal-700" />
            </div>
          ) : isError ? (
            <div className="mt-10 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              {error instanceof Error ? error.message : 'Failed to load job detail.'}
            </div>
          ) : data ? (
            <div className="mt-7 space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">Fit {formatScore(data.candidate_fit_score)}</Badge>
                <Badge variant="accent">Relevance {formatScore(data.relevance_score)}</Badge>
                <Badge variant="warning">{toTitleCase(data.apply_priority)}</Badge>
                <Badge>{toTitleCase(data.apply_recommendation)}</Badge>
              </div>

              <Section title="Fit Summary" icon={Target}>
                <p>{data.fit_summary || 'Fit summary unavailable.'}</p>
              </Section>

              <div className="grid gap-5 md:grid-cols-2">
                <Section title="Strengths" icon={Sparkles}>
                  <div className="flex flex-wrap gap-2">
                    {asStringArray(data.strengths).length > 0 ? asStringArray(data.strengths).map((item) => <Badge key={item} variant="success">{item}</Badge>) : <Badge variant="neutral">No strengths listed</Badge>}
                  </div>
                </Section>
                <Section title="Gaps" icon={FileBadge2}>
                  <div className="flex flex-wrap gap-2">
                    {asStringArray(data.gaps).length > 0 ? asStringArray(data.gaps).map((item) => <Badge key={item} variant="warning">{item}</Badge>) : <Badge variant="neutral">No gaps listed</Badge>}
                  </div>
                </Section>
              </div>

              <Section title="Resume Suggestions" icon={BriefcaseBusiness}>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {asStringArray(data.resume_keywords_to_add).length > 0 ? asStringArray(data.resume_keywords_to_add).map((item) => <Badge key={item}>{item}</Badge>) : <Badge variant="neutral">No keyword suggestions</Badge>}
                  </div>
                  <p>{data.resume_angle || 'No resume positioning guidance available.'}</p>
                </div>
              </Section>

              <Section title="Cover Letter Angle" icon={MessageSquareQuote}>
                <p>{data.cover_letter_angle || 'No cover letter guidance available.'}</p>
              </Section>

              <Section title="Interview Prep Topics" icon={Sparkles}>
                <div className="flex flex-wrap gap-2">
                  {asStringArray(data.interview_prep_topics).length > 0 ? asStringArray(data.interview_prep_topics).map((item) => <Badge key={item} variant="accent">{item}</Badge>) : <Badge variant="neutral">No topics suggested</Badge>}
                </div>
              </Section>

              <Section title="Job Description" icon={FileBadge2}>
                <p className="whitespace-pre-wrap">{data.description || 'Description unavailable.'}</p>
              </Section>

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <a href={data.url || '#'} target="_blank" rel="noreferrer">
                    Open job posting
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
