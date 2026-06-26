import { Search } from 'lucide-react'
import { Input } from './ui/input'
import { Select } from './ui/select'

export type JobFiltersState = {
  query: string
  applyPriority: string
  recommendation: string
  source: string
  minFitScore: string
}

type JobFiltersProps = {
  filters: JobFiltersState
  sources: string[]
  onChange: (next: JobFiltersState) => void
}

export function JobFilters({ filters, sources, onChange }: JobFiltersProps) {
  return (
    <div className="grid gap-3 rounded-[28px] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/85 p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
      <div className="relative xl:col-span-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Search by title or company"
          className="pl-11"
        />
      </div>

      <Select value={filters.applyPriority} onChange={(event) => onChange({ ...filters, applyPriority: event.target.value })}>
        <option value="ALL">All priorities</option>
        <option value="HIGH">High priority</option>
        <option value="MEDIUM">Medium priority</option>
        <option value="LOW">Low priority</option>
      </Select>

      <Select value={filters.recommendation} onChange={(event) => onChange({ ...filters, recommendation: event.target.value })}>
        <option value="ALL">All recommendations</option>
        <option value="APPLY">Apply</option>
        <option value="MAYBE">Maybe</option>
        <option value="REVIEW">Review</option>
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Select value={filters.source} onChange={(event) => onChange({ ...filters, source: event.target.value })}>
          <option value="ALL">All sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min="0"
          max="100"
          step="5"
          placeholder="Min fit"
          value={filters.minFitScore}
          onChange={(event) => onChange({ ...filters, minFitScore: event.target.value })}
        />
      </div>
    </div>
  )
}
