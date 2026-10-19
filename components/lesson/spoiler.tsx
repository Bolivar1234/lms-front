'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { IconChevronDown, IconEye, IconEyeOff } from '@tabler/icons-react'

interface SpoilerProps {
  title?: string
  /** Alias of `title`; the block editor and the MDX docs write `label`. */
  label?: string
  children: React.ReactNode
  className?: string
  defaultOpen?: boolean
}

export function Spoiler({
  title,
  label,
  children,
  className,
  defaultOpen = false,
}: SpoilerProps) {
  const t = useTranslations('lessonContent.spoiler')
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const displayTitle = title || label || t('answer')

  return (
    <div
      className={cn(
        'my-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          {isOpen ? (
            <IconEyeOff className="size-4" aria-hidden="true" />
          ) : (
            <IconEye className="size-4" aria-hidden="true" />
          )}
          {displayTitle}
        </span>
        <IconChevronDown
          className={cn(
            'size-4 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>
      
      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-dashed border-muted-foreground/30 px-4 py-3 text-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// Aliases for MDX
type SpoilerAliasProps = Omit<SpoilerProps, 'title' | 'label'>

export function Solution(props: SpoilerAliasProps) {
  const t = useTranslations('lessonContent.spoiler')
  return <Spoiler title={t('solution')} {...props} />
}
export function Hint(props: SpoilerAliasProps) {
  const t = useTranslations('lessonContent.spoiler')
  return <Spoiler title={t('hint')} {...props} />
}
export function Answer(props: SpoilerAliasProps) {
  const t = useTranslations('lessonContent.spoiler')
  return <Spoiler title={t('answer')} {...props} />
}
