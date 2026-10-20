import { cn } from '@/lib/utils'

interface StepsProps {
  children: React.ReactNode
  className?: string
}

export function Steps({ children, className }: StepsProps) {
  return (
    <div className={cn('my-6 ml-4 border-l-2 border-muted pl-6 space-y-6 [counter-reset:step]', className)}>
      {children}
    </div>
  )
}

interface StepProps {
  title?: string
  children: React.ReactNode
  className?: string
}

// Numbering is a CSS counter reset by <Steps>, so it is per-list and identical
// on the server and the client (a module-level counter kept counting across
// requests on the server).
export function Step({ title, children, className }: StepProps) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute -left-[calc(1.5rem+1px)] flex size-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-sm font-bold text-brand-text [counter-increment:step] before:content-[counter(step)]" />

      <div className="pt-0.5">
        {title && (
          <h4 className="mb-2 font-semibold text-sm">{title}</h4>
        )}
        <div className="text-sm text-muted-foreground [&>p]:mb-2 [&>p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}

// Versión alternativa con números explícitos
interface NumberedStepProps extends StepProps {
  number: number
}

export function NumberedStep({ number, title, children, className }: NumberedStepProps) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute -left-[calc(1.5rem+1px)] flex size-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-sm font-bold text-brand-text">
        {number}
      </div>

      <div className="pt-0.5">
        {title && (
          <h4 className="mb-2 font-semibold text-sm">{title}</h4>
        )}
        <div className="text-sm text-muted-foreground [&>p]:mb-2 [&>p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}
