import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Bot, Copy, ExternalLink, Save } from 'lucide-react'
import { toast } from 'sonner'
import { getApiBaseUrl, updateAutofillSettings } from '../lib/api'
import { getAuthToken } from '../lib/auth'
import type { AutofillSettings, AuthUser } from '../types/api'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Select } from './ui/select'

type AutofillPreferencesCardProps = {
  settings: AutofillSettings
  user: AuthUser
  showCard?: boolean
}

type AutofillFormState = Omit<AutofillSettings, 'updated_at'> & {
  custom_answers_text: string
}

function customAnswersToText(customAnswers: Record<string, string>) {
  return Object.entries(customAnswers)
    .map(([question, answer]) => `${question} = ${answer}`)
    .join('\n')
}

function parseCustomAnswers(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, line) => {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) return result
      const question = line.slice(0, separatorIndex).trim()
      const answer = line.slice(separatorIndex + 1).trim()
      if (!question || !answer) return result
      result[question] = answer
      return result
    }, {})
}

function buildInitialState(settings: AutofillSettings): AutofillFormState {
  return {
    phone: settings.phone ?? '',
    city: settings.city ?? '',
    state: settings.state ?? '',
    country: settings.country ?? '',
    postal_code: settings.postal_code ?? '',
    linkedin_url: settings.linkedin_url ?? '',
    github_url: settings.github_url ?? '',
    portfolio_url: settings.portfolio_url ?? '',
    website_url: settings.website_url ?? '',
    pronouns: settings.pronouns ?? '',
    work_authorization: settings.work_authorization ?? '',
    authorized_to_work_in_us: settings.authorized_to_work_in_us ?? '',
    requires_sponsorship: settings.requires_sponsorship,
    hispanic_or_latino: settings.hispanic_or_latino ?? '',
    gender_identity: settings.gender_identity ?? '',
    race_ethnicity: settings.race_ethnicity ?? '',
    veteran_status: settings.veteran_status ?? '',
    disability_status: settings.disability_status ?? '',
    custom_answers: settings.custom_answers ?? {},
    custom_answers_text: customAnswersToText(settings.custom_answers ?? {}),
  }
}

export function AutofillPreferencesCard({ settings, user, showCard = true }: AutofillPreferencesCardProps) {
  const [form, setForm] = useState<AutofillFormState>(() => buildInitialState(settings))

  useEffect(() => {
    setForm(buildInitialState(settings))
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { custom_answers_text, ...rest } = form
      return updateAutofillSettings({
        ...rest,
        custom_answers: parseCustomAnswers(custom_answers_text),
      })
    },
    onSuccess: () => {
      toast.success('Autofill preferences saved.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save autofill preferences.')
    },
  })

  async function copySetup() {
    const token = getAuthToken()
    if (!token) {
      toast.error('You need an active session before exporting extension setup.')
      return
    }

    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          apiBaseUrl: getApiBaseUrl(),
          authToken: token,
          email: user.email,
        },
        null,
        2,
      ),
    )
    toast.success('Greenhouse helper setup copied to clipboard.')
  }

  function updateField<K extends keyof AutofillFormState>(key: K, value: AutofillFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const content = (
    <div className={showCard ? '' : 'rounded-[28px] bg-white p-6 sm:p-8 dark:bg-slate-950'}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-300">
            <Bot className="h-3.5 w-3.5" />
            Greenhouse Autofill
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold text-slate-950 dark:text-white">Answer once, reuse on every Greenhouse application.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
            Chopron will use your saved answers for work authorization, sponsorship, demographic questions, links, and contact data. The browser helper reads this profile and adds an `Auto-apply` button on Greenhouse pages.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={copySetup}>
            <Copy className="h-4 w-4" />
            Copy setup JSON
          </Button>
          <Button asChild variant="secondary">
            <a href="/greenhouse-autofill/README.md" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open install guide
            </a>
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Field label="Phone">
          <Input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="(555) 555-5555" />
        </Field>
        <Field label="Pronouns">
          <Input value={form.pronouns} onChange={(event) => updateField('pronouns', event.target.value)} placeholder="she/her" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(event) => updateField('city', event.target.value)} placeholder="New York" />
        </Field>
        <Field label="State / Province">
          <Input value={form.state} onChange={(event) => updateField('state', event.target.value)} placeholder="NY" />
        </Field>
        <Field label="Country">
          <Input value={form.country} onChange={(event) => updateField('country', event.target.value)} placeholder="United States" />
        </Field>
        <Field label="Postal code">
          <Input value={form.postal_code} onChange={(event) => updateField('postal_code', event.target.value)} placeholder="10001" />
        </Field>
        <Field label="LinkedIn URL">
          <Input value={form.linkedin_url} onChange={(event) => updateField('linkedin_url', event.target.value)} placeholder="https://linkedin.com/in/..." />
        </Field>
        <Field label="GitHub URL">
          <Input value={form.github_url} onChange={(event) => updateField('github_url', event.target.value)} placeholder="https://github.com/..." />
        </Field>
        <Field label="Portfolio URL">
          <Input value={form.portfolio_url} onChange={(event) => updateField('portfolio_url', event.target.value)} placeholder="https://your-portfolio.com" />
        </Field>
        <Field label="Website URL">
          <Input value={form.website_url} onChange={(event) => updateField('website_url', event.target.value)} placeholder="https://your-site.com" />
        </Field>
        <Field label="Work authorization / citizenship status">
          <Select value={form.work_authorization} onChange={(event) => updateField('work_authorization', event.target.value)}>
            <option value="">Select one</option>
            <option value="U.S. Citizen">U.S. Citizen</option>
            <option value="Permanent Resident">Permanent Resident</option>
            <option value="F-1 Student Visa">F-1 Student Visa</option>
            <option value="H-1B Visa">H-1B Visa</option>
            <option value="Other">Other</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </Select>
        </Field>
        <Field label="Legally authorized to work in the U.S.">
          <Select value={form.authorized_to_work_in_us} onChange={(event) => updateField('authorized_to_work_in_us', event.target.value)}>
            <option value="">Select one</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </Select>
        </Field>
        <Field label="Need sponsorship now or in the future">
          <Select
            value={
              form.requires_sponsorship === null
                ? ''
                : form.requires_sponsorship
                  ? 'yes'
                  : 'no'
            }
            onChange={(event) =>
              updateField(
                'requires_sponsorship',
                event.target.value === '' ? null : event.target.value === 'yes',
              )
            }
          >
            <option value="">Select one</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Hispanic or Latino">
          <Select value={form.hispanic_or_latino} onChange={(event) => updateField('hispanic_or_latino', event.target.value)}>
            <option value="">Select one</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </Select>
        </Field>
        <Field label="Gender identity">
          <Select value={form.gender_identity} onChange={(event) => updateField('gender_identity', event.target.value)}>
            <option value="">Select one</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </Select>
        </Field>
        <Field label="Race / ethnicity">
          <Select value={form.race_ethnicity} onChange={(event) => updateField('race_ethnicity', event.target.value)}>
            <option value="">Select one</option>
            <option value="American Indian or Alaska Native">American Indian or Alaska Native</option>
            <option value="Asian">Asian</option>
            <option value="Black or African American">Black or African American</option>
            <option value="Native Hawaiian or Other Pacific Islander">Native Hawaiian or Other Pacific Islander</option>
            <option value="White">White</option>
            <option value="Two or More Races">Two or More Races</option>
            <option value="Prefer not to self-identify">Prefer not to self-identify</option>
          </Select>
        </Field>
        <Field label="Veteran status">
          <Select value={form.veteran_status} onChange={(event) => updateField('veteran_status', event.target.value)}>
            <option value="">Select one</option>
            <option value="I am not a protected veteran">I am not a protected veteran</option>
            <option value="I identify as one or more of the classifications of a protected veteran">I identify as one or more protected veteran classifications</option>
            <option value="I don't wish to answer">I don't wish to answer</option>
          </Select>
        </Field>
        <Field label="Disability status">
          <Select value={form.disability_status} onChange={(event) => updateField('disability_status', event.target.value)}>
            <option value="">Select one</option>
            <option value="Yes, I have a disability, or have had one in the past">Yes, I have or had a disability</option>
            <option value="No, I do not have a disability and have not had one in the past">No, I do not have a disability</option>
            <option value="I don't wish to answer">I don't wish to answer</option>
          </Select>
        </Field>
      </div>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Custom question overrides</label>
        <textarea
          className="min-h-36 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          value={form.custom_answers_text}
          onChange={(event) => updateField('custom_answers_text', event.target.value)}
          placeholder={"salary expectation = 150000\nare you open to relocation = Yes"}
        />
        <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
          Use one rule per line in the format `question fragment = answer`. If a Greenhouse form asks a custom question that Chopron does not recognize, add it here once.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save autofill answers'}
        </Button>
        <p className="self-center text-sm text-slate-500 dark:text-slate-400">
          After saving, load the unpacked extension from `frontend/dist/greenhouse-autofill`, then paste the copied setup JSON into its options page one time. The `Auto-apply` button appears on actual Greenhouse application pages, not inside this dashboard.
        </p>
      </div>
    </div>
  )

  if (!showCard) {
    return content
  }

  return (
    <Card className="p-6 sm:p-8">
      {content}
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      {children}
    </div>
  )
}
