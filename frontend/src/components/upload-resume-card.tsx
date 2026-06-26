import { LoaderCircle, UploadCloud } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { uploadResume } from '../lib/api'
import { startNewFlow } from '../lib/request-context'
import type { ProfileResponse } from '../types/api'
import { Button } from './ui/button'
import { Card } from './ui/card'

type UploadResumeCardProps = {
  onUploaded: (profile: ProfileResponse) => void
  disabled?: boolean
  helperText?: string
}

export function UploadResumeCard({ onUploaded, disabled = false, helperText }: UploadResumeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || disabled) return

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF resumes are supported.')
      event.target.value = ''
      setFileName('')
      return
    }

    setFileName(file.name)
    setIsUploading(true)

    try {
      const flowId = startNewFlow()
      const profile = await uploadResume(file, flowId)
      onUploaded(profile)
      toast.success('Resume uploaded and profile extracted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload resume.')
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  return (
    <Card className="relative overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-teal-500/12 via-sky-400/10 to-transparent" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-bold text-slate-950 dark:text-white">Upload Resume</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Drop in your current PDF resume and let Chopron build the candidate profile the rest of the dashboard uses.
            </p>
          </div>
          <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-700 sm:flex dark:text-teal-300">
            <UploadCloud className="h-7 w-7" />
          </div>
        </div>

        <label className="mt-8 flex cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center transition hover:border-teal-500 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-teal-500 dark:hover:bg-teal-950/20">
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} disabled={disabled} />
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-950">
            {isUploading ? <LoaderCircle className="h-7 w-7 animate-spin text-teal-700" /> : <UploadCloud className="h-7 w-7 text-teal-700" />}
          </div>
          <p className="mt-5 font-semibold text-slate-900 dark:text-white">
            {isUploading ? 'Extracting candidate profile...' : disabled ? 'Backend unavailable' : 'Choose a PDF resume'}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {helperText || fileName || 'Upload resume -> AI profile -> matching jobs -> fit analysis -> apply guidance'}
          </p>
          <Button type="button" variant="secondary" className="mt-6" onClick={() => inputRef.current?.click()} disabled={isUploading || disabled}>
            {isUploading ? 'Uploading...' : disabled ? 'Start backend first' : 'Select Resume'}
          </Button>
        </label>
      </div>
    </Card>
  )
}
