'use client'

import { createContext, useContext } from 'react'

export const LessonMediaUploadContext = createContext<{ lessonId: number | null; revision: string }>({ lessonId: null, revision: '' })
export const useLessonMediaUploadContext = () => useContext(LessonMediaUploadContext)
