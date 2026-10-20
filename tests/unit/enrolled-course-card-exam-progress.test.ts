import { describe, it, expect } from 'vitest'
import type { ExamSubmissionRow } from '@lms/core'
import { toExamInfos } from '@/components/student/enrolled-course-card'
import { calculateCourseProgress } from '@/lib/services/course-progress-service'

// The card is fed rows straight from getExamSubmissions. It used to look for
// student_id / submitted_at / exam_scores, none of which that query selects,
// so every attempt was filtered out and exams never counted toward progress.

function submission(overrides: Partial<ExamSubmissionRow> = {}): ExamSubmissionRow {
  return {
    submission_id: 1,
    exam_id: 10,
    score: 85,
    submission_date: '2026-10-01T12:00:00Z',
    ...overrides,
  }
}

describe('EnrolledCourseCard exam progress', () => {
  it('counts attempts from getExamSubmissions rows', () => {
    const exams = toExamInfos([
      { exam_id: 10, title: 'Final', sequence: 1, exam_submissions: [submission()] },
    ])

    expect(exams[0].attempts).toHaveLength(1)
    expect(exams[0].attempts[0]).toMatchObject({ submissionId: 1, score: 85 })
    expect(exams[0].attempts[0].submittedAt.toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })

  it('a passing submission marks the exam passed in course progress', () => {
    const exams = toExamInfos([
      { exam_id: 10, title: 'Final', sequence: 1, exam_submissions: [submission({ score: 90 })] },
    ])

    const progress = calculateCourseProgress(2, 2, exams)
    expect(progress.examsPassed).toBe(1)
    expect(progress.status).toBe('completed')
  })

  it('treats a null (ungraded) score as 0 and an exam with no rows as unattempted', () => {
    const exams = toExamInfos([
      { exam_id: 10, title: 'Final', sequence: null, exam_submissions: [submission({ score: null })] },
      { exam_id: 11, title: 'Quiz', sequence: 2 },
    ])

    expect(exams[0].attempts[0].score).toBe(0)
    expect(exams[0].sequence).toBe(0)
    expect(exams[1].attempts).toEqual([])
    expect(calculateCourseProgress(1, 1, exams).examsPassed).toBe(0)
  })
})
