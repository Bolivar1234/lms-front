'use client'

import { useTranslations } from 'next-intl'

import { ImageUploadField } from '@/components/shared/image-upload-field'
import { useLessonMediaUploadContext } from '../media-upload-context'
import type { ImageBlock } from '../types'
import { Input } from '@/components/ui/input'
import { IconPhoto } from '@tabler/icons-react'
import { uploadCourseImage } from '@/app/actions/teacher/course-images'
import { ExpiringUrlWarning } from './expiring-url-warning'

interface ImageBlockEditorProps {
  block: ImageBlock
  onChange: (updates: Partial<ImageBlock>) => void
}

export function ImageBlockEditor({ block, onChange }: ImageBlockEditorProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
  const { revision } = useLessonMediaUploadContext()

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconPhoto className="h-4 w-4 text-primary" />
        {t('blocks.image.label')}
      </div>
      <ImageUploadField label="Lesson image" value={block.src} onChange={(src) => onChange({ src })} identityKey={`${block.id}:${revision}`} uploadAction={async (data) => {
        const result = await uploadCourseImage(data)
        return result.success ? { success: true, data: { url: result.url } } : result
      }} />
      <ExpiringUrlWarning
        url={block.src}
        hint={t('image.uploadHint')}
      />
      <Input
        value={block.alt}
        onChange={(e) => onChange({ alt: e.target.value })}
        placeholder={t('image.altPlaceholder')}
      />
      <Input
        value={block.caption || ''}
        onChange={(e) => onChange({ caption: e.target.value || undefined })}
        placeholder={t('image.captionPlaceholder')}
        className="text-sm"
      />

    </div>
  )
}
