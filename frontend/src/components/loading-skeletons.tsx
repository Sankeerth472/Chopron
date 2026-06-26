export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-64 rounded-[28px] bg-slate-200/70 dark:bg-slate-800/70" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-40 rounded-[28px] bg-slate-200/70 dark:bg-slate-800/70" />
        ))}
      </div>
      <div className="h-56 rounded-[28px] bg-slate-200/70 dark:bg-slate-800/70" />
    </div>
  )
}

export function JobsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-72 animate-pulse rounded-[28px] bg-slate-200/70 dark:bg-slate-800/70" />
      ))}
    </div>
  )
}
