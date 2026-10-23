export type StorageUploadScope =
  | { purpose: 'landing-image' }
  | { purpose: 'avatar' }
  | { purpose: 'course-image'; courseId?: number }
  | { purpose: 'certificate-logo'; courseId?: number }
  | { purpose: 'certificate-signature'; courseId?: number }
  | { purpose: 'lesson-image'; lessonId: number; courseId?: number }
  | { purpose: 'lesson-audio'; lessonId: number; courseId?: number }
  | { purpose: 'lesson-file'; lessonId: number; courseId?: number }

export type LessonMediaPurpose = 'lesson-image' | 'lesson-audio' | 'lesson-file'

export interface UploadedAsset {
  /** Persist this value. Private media uses a durable lesson-resource reference. */
  url: string
  reference: string
  bucket: string
  path: string
  mimeType: string
  size: number
  fileName: string
  resourceId?: number
  lessonId?: number
}
