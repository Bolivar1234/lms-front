'use client'

import { MediaUploadField } from '@/components/shared/image-upload-field'
import { uploadLessonMedia } from '@/app/actions/teacher/lesson-media'
import { useLessonMediaUploadContext } from '../media-upload-context'

export function LessonMediaUploadField({ blockId, value, onChange, purpose, label, onFileName }: {
  blockId: string
  value: string
  onChange: (value: string) => void
  purpose: 'lesson-audio' | 'lesson-file'
  label: string
  onFileName?: (name: string) => void
}) {
  const { lessonId, revision } = useLessonMediaUploadContext()
  return <MediaUploadField label={label} value={value} onChange={onChange} identityKey={`${blockId}:${lessonId}:${revision}`} uploadDisabled={!lessonId}
    hint={!lessonId ? 'Save the lesson before uploading media.' : 'Upload a file, or paste an external URL.'}
    accept={purpose === 'lesson-audio' ? 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/aac' : '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp'}
    maxBytes={(purpose === 'lesson-audio' ? 25 : 10) * 1024 * 1024}
    uploadAction={(data) => lessonId ? uploadLessonMedia(lessonId, data, purpose) : Promise.resolve({ success: false, error: 'Save the lesson before uploading media.' })}
    createUploadCommit={() => (url, fileName) => { onChange(url); if (fileName) onFileName?.(fileName) }} />
}
