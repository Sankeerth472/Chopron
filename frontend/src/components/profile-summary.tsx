import { BriefcaseBusiness, GraduationCap, ScanSearch, Sparkles } from 'lucide-react'
import { asStringArray, getDisplayEducation, summarizeProfile, toTitleCase } from '../lib/format'
import type { ProfileResponse } from '../types/api'
import { Badge } from './ui/badge'
import { Card } from './ui/card'

type ProfileSummaryProps = {
  profile: ProfileResponse
}

export function ProfileSummary({ profile }: ProfileSummaryProps) {
  const summary = summarizeProfile(profile.candidate_profile)
  const weakerSkills = asStringArray(profile.candidate_profile.missing_or_weaker_skills).slice(0, 5)
  const domains = asStringArray(profile.candidate_profile.domains).slice(0, 4)
  const education = getDisplayEducation(profile.candidate_profile)

  return (
    <Card className="overflow-hidden p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="inline-flex rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-300">
            Candidate Profile
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {summary.roles.length > 0 ? (
              summary.roles.map((role) => <Badge key={role} variant="accent">{role}</Badge>)
            ) : (
              <Badge variant="neutral">Role targets unavailable</Badge>
            )}
            {profile.candidate_profile.seniority ? <Badge variant="neutral">{toTitleCase(profile.candidate_profile.seniority)}</Badge> : null}
          </div>
          <p className="mt-5 text-sm leading-7 text-slate-600 dark:text-slate-300">{summary.summary}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {summary.skills.length > 0 ? summary.skills.map((skill) => <Badge key={skill}>{skill}</Badge>) : <Badge>No skills extracted yet</Badge>}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-slate-900/80">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <BriefcaseBusiness className="h-4 w-4 text-teal-600" />
              Focus Areas
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {domains.length > 0 ? domains.join(', ') : 'Domain signals will appear here after profile extraction.'}
            </p>
          </div>
          <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-slate-900/80">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <GraduationCap className="h-4 w-4 text-sky-600" />
              Education
            </div>
            {education.length > 0 ? (
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {education.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Education summary unavailable.</p>
            )}
          </div>
          <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-slate-900/80">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <ScanSearch className="h-4 w-4 text-amber-600" />
              Weaker Skills
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {weakerSkills.length > 0 ? weakerSkills.map((skill) => <Badge key={skill} variant="warning">{skill}</Badge>) : <Badge variant="neutral">No obvious gaps extracted</Badge>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[24px] border border-slate-200/70 bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white dark:border-slate-800">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-teal-300" />
          Resume on file
        </div>
        <p className="mt-2 text-sm text-slate-300">{profile.filename}</p>
      </div>
    </Card>
  )
}
