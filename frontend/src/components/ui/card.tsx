import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/90 shadow-[0_22px_70px_-40px_rgba(15,23,42,0.42)] backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  )
}
