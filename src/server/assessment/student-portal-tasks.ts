import { db } from "@/lib/db";
import { studentCourse, type AssignmentStudent } from "./assignments";
import { studentPortalAssignmentGrade } from "./assignment-policies";

/** The portal's five-task preview, with the same course access as the task screens. */
export async function listPortalTasksForStudent(student: AssignmentStudent, courseId: string) {
  const course = await studentCourse(student, courseId);
  if (!course) return null;
  const assignments = await db.assignment.findMany({
    where: { courseId: course.id, isPublished: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 5,
    select: {
      id: true, title: true, dueDate: true, maxScore: true,
      submissions: {
        where: { studentId: student.id, enrollmentId: course.enrollmentId },
        select: { status: true, score: true, submittedAt: true },
      },
      gradeItem: {
        select: {
          institutionId: true, courseId: true, isPublished: true,
          entries: {
            where: { institutionId: student.institutionId, enrollmentId: course.enrollmentId },
            select: { score: true, feedback: true, isExcused: true },
          },
        },
      },
    },
  });
  return {
    course,
    assignments: assignments.map(({ submissions, gradeItem, ...assignment }) => {
      const own = submissions[0] ?? null;
      // A malformed cross-course/institution link must not permit stale submission fallback.
      const linked = gradeItem && {
        ...gradeItem,
        isPublished: gradeItem.isPublished && gradeItem.institutionId === student.institutionId && gradeItem.courseId === course.id,
      };
      return {
        ...assignment,
        ...studentPortalAssignmentGrade(own, linked),
        submittedAt: own && own.status !== "DRAFT" ? own.submittedAt : null,
      };
    }),
  };
}
