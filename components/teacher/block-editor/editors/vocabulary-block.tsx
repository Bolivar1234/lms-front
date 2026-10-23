'use client'

import { useTranslations } from 'next-intl'

import type { VocabularyBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconBook } from '@tabler/icons-react'
import { LessonMediaUploadField } from './lesson-media-upload-field'

interface VocabularyBlockEditorProps {
  block: VocabularyBlock
  onChange: (updates: Partial<VocabularyBlock>) => void
}

export function VocabularyBlockEditor({ block, onChange }: VocabularyBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  return (
    <div className="space-y-2 rounded-lg border bg-brand-tint p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-brand-text">
        <IconBook className="h-4 w-4" />
        {t('blocks.vocabulary.label')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={block.word}
          onChange={(e) => onChange({ word: e.target.value })}
          placeholder={t('vocabulary.word')}
        />
        <Input
          value={block.translation}
          onChange={(e) => onChange({ translation: e.target.value })}
          placeholder={t('vocabulary.translation')}
        />
      </div>
      <LessonMediaUploadField blockId={block.id} label="Vocabulary audio" purpose="lesson-audio" value={block.audioUrl || block.audio || ''} onChange={(audioUrl) => onChange({ audioUrl: audioUrl || undefined, audio: undefined })} />
    </div>
  )
}
