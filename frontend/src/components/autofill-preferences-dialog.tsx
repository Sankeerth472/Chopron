import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { Bot, CircleX, LoaderCircle } from 'lucide-react'
import { getAutofillSettings } from '../lib/api'
import { getStoredSession } from '../lib/auth'
import { AutofillPreferencesCard } from './autofill-preferences-card'

type AutofillPreferencesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AutofillPreferencesDialog({ open, onOpenChange }: AutofillPreferencesDialogProps) {
  const session = getStoredSession()
  const settingsQuery = useQuery({
    queryKey: ['autofill-settings'],
    queryFn: getAutofillSettings,
    enabled: open,
    staleTime: 60_000,
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-md" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 max-h-[88vh] -translate-y-1/2 overflow-y-auto rounded-[32px] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-[0_32px_120px_-48px_rgba(15,23,42,0.9)] outline-none sm:inset-x-8 lg:left-[calc(50%+2rem)] lg:right-10 lg:max-w-5xl lg:-translate-x-1/2">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200/70 bg-white/92 px-6 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/92 sm:px-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-300">
                <Bot className="h-3.5 w-3.5" />
                Autofill Info
              </div>
              <Dialog.Title className="mt-3 font-display text-3xl font-bold text-slate-950 dark:text-white">
                Autofill answers for Greenhouse applications
              </Dialog.Title>
              <Dialog.Description className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                This overlay is where you save the one-time answers Chopron should reuse. The actual `Auto-apply` button appears on Greenhouse application pages after the helper extension is loaded.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white">
                <CircleX className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-4 sm:p-6">
            {!session ? (
              <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                Sign in first to configure autofill information.
              </div>
            ) : settingsQuery.isLoading ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <LoaderCircle className="h-8 w-8 animate-spin text-teal-700" />
              </div>
            ) : settingsQuery.isError ? (
              <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                {settingsQuery.error instanceof Error ? settingsQuery.error.message : 'Failed to load autofill settings.'}
              </div>
            ) : settingsQuery.data ? (
              <AutofillPreferencesCard settings={settingsQuery.data} user={session.user} showCard={false} />
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
