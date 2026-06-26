import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide',
  {
    variants: {
      variant: {
        neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
        warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
        danger: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200',
        accent: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}
