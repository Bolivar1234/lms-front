'use client'

import { useTranslations } from 'next-intl'

import type { AudioBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconVolume } from '@tabler/icons-react'
import { ExpiringUrlWarning } from './expiring-url-warning'
import { LessonMediaUploadField } from './lesson-media-upload-field'
import { Audio } from '@/components/lesson/audio'

interface AudioBlockEditorProps {
  block: AudioBlock
  onChange: (updates: Partial<AudioBlock>) => void
}

export function AudioBlockEditor({ block, onChange }: AudioBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconVolume className="h-4 w-4 text-primary" />
        {t('blocks.audio.label')}
      </div>
      <LessonMediaUploadField blockId={block.id} label="Audio file" purpose="lesson-audio" value={block.src} onChange={(src) => onChange({ src })} />
      <ExpiringUrlWarning
        url={block.src}
        hint={t('audio.uploadHint')}
      />
      <Input
        value={block.title || ''}
        onChange={(e) => onChange({ title: e.target.value || undefined })}
        placeholder={t('audio.titlePlaceholder')}
        className="text-sm"
      />
      {block.src && (
        <div className="mt-2 overflow-hidden rounded-md border p-2">
          <Audio src={block.src} />
        </div>
      )}
    </div>
  )
}
