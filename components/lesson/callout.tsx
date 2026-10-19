'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  IconInfoCircle,
  IconAlertTriangle,
  IconBulb,
  IconCircleCheck,
  IconAlertCircle,
} from '@tabler/icons-react'

type CalloutType = 'info' | 'warning' | 'tip' | 'success' | 'danger'

interface CalloutProps {
  type?: CalloutType
  title?: string
  children: React.ReactNode
  className?: string
}

const calloutConfig: Record<
  CalloutType,
  { icon: React.ElementType; className: string }
> = {
  info: {
    icon: IconInfoCircle,
    className: 'border-primary/25 bg-brand-tint text-brand-text',
  },
  warning: {
    icon: IconAlertTriangle,
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  tip: {
    icon: IconBulb,
    className: 'border-success/30 bg-success/10 text-success',
  },
  success: {
    icon: IconCircleCheck,
    className: 'border-success/30 bg-success/10 text-success',
  },
  danger: {
    icon: IconAlertCircle,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
}

export function Callout({ type = 'info', title, children, className }: CalloutProps) {
  const t = useTranslations('lessonContent.callout')
  const config = calloutConfig[type]
  const Icon = config.icon
  const displayTitle = title ?? t(type)

  return (
    <div
      className={cn(
        'my-4 flex gap-3 rounded-lg border p-4',
        config.className,
        className
      )}
      role="note"
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        {displayTitle && (
          <p className="font-semibold text-sm">{displayTitle}</p>
        )}
        <div className="text-sm [&>p]:mb-2 [&>p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}

// Alias para uso más sencillo en MDX
export const Info = (props: Omit<CalloutProps, 'type'>) => <Callout type="info" {...props} />
export const Warning = (props: Omit<CalloutProps, 'type'>) => <Callout type="warning" {...props} />
export const Tip = (props: Omit<CalloutProps, 'type'>) => <Callout type="tip" {...props} />
export const Success = (props: Omit<CalloutProps, 'type'>) => <Callout type="success" {...props} />
export const Danger = (props: Omit<CalloutProps, 'type'>) => <Callout type="danger" {...props} />
