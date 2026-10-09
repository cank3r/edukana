import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { getCoordinatorHome } from "@/server/coordinator-home";
import { A, B, ensureSeed } from "./setup";

const PREFIX = "it_ch_";
const DAY = 24 * 60 * 60_000;

async function cleanUp() {
  await db.submission.deleteMany({ where: { assignment: { id: { startsWith: PREFIX } } } });
  await db.assignment.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await db.announcement.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

async function homeOf(actor: typeof A.coordinator, now: Date) {
  return getCoordinatorHome(actor, await getEffectiveCapabilities(actor.institutionId, actor.role), now);
}

/** Una tarea del curso con una entrega del estudiante que espera nota desde `submittedAt`. */
async function waitingSubmission(id: string, fixture: typeof A, submittedAt: Date) {
  await db.assignment.create({ data: { id, institutionId: fixture.institutionId, courseId: fixture.courseId, title: `Tarea ${id}`, isPublished: true } });
  await db.submission.create({
    data: { institutionId: fixture.institutionId, assignmentId: id, studentId: fixture.student.id, enrollmentId: `${fixture === A ? "a" : "b"}_enrollment`, content: "Mi entrega", status: "SUBMITTED", submittedAt },
  });
}

before(async () => {
  await ensureSeed();
  await cleanUp();
});
after(async () => {
  await cleanUp();
  await db.$disconnect();
});

test("inicio del coordinador: entregas atrasadas, cursos por completar, docentes y avisos de su institución", async () => {
  const now = new Date();
  const baseline = await homeOf(A.coordinator, now);
  const waitingOf = (home: typeof baseline, courseId: string) => home.lateGrading.find((course) => course.courseId === courseId)?.waiting ?? 0;
  const loadOf = (home: typeof baseline, teacherId: string) => home.teachers.find((teacher) => teacher.teacherId === teacherId)?.waiting ?? 0;

  await waitingSubmission(`${PREFIX}stale`, A, new Date(now.getTime() - 10 * DAY));
  await waitingSubmission(`${PREFIX}fresh`, A, new Date(now.getTime() - DAY));
  await db.announcement.create({
    data: { id: `${PREFIX}notice`, institutionId: A.institutionId, authorId: A.admin.id, title: "Aviso reciente del coordinador A", content: "Contenido del aviso", audienceInstitution: true, publishedAt: now },
  });

  const home = await homeOf(A.coordinator, now);
  // Solo la entrega de hace 10 días cuenta como atrasada; las dos cuentan como pendientes del docente.
  assert.equal(waitingOf(home, A.courseId), waitingOf(baseline, A.courseId) + 1);
  assert.equal(loadOf(home, A.teacher.id), loadOf(baseline, A.teacher.id) + 2);
  assert.equal(home.lateGrading.find((course) => course.courseId === A.courseId)?.teacherName, "teacher A");

  const course2Students = await db.enrollment.count({ where: { courseId: A.course2Id, status: "ACTIVE" } });
  const gap = home.gaps.find((course) => course.courseId === A.course2Id);
  if (course2Students === 0) assert.equal(gap?.noStudents, true, "el curso sin inscritos aparece por completar");
  assert.equal(home.announcements[0]?.id, `${PREFIX}notice`);
  assert.equal(home.institutionName, (await db.institution.findUniqueOrThrow({ where: { id: A.institutionId } })).name);
  assert.equal(home.courseCount, await db.course.count({ where: { institutionId: A.institutionId, archivedAt: null } }));

  // Nada de B se cuela en el inicio de A.
  const json = JSON.stringify(home);
  for (const foreign of [B.courseId, B.course2Id, B.teacher.id, B.teacher2.id, "b_announcement"]) assert.equal(json.includes(`"${foreign}"`), false, foreign);
});

test("inicio del coordinador: lo que pasa en A no mueve el inicio de B, y viceversa", async () => {
  const now = new Date();
  await waitingSubmission(`${PREFIX}b_stale`, B, new Date(now.getTime() - 9 * DAY));
  const homeB = await homeOf(B.coordinator, now);
  assert.ok(homeB.lateGrading.some((course) => course.courseId === B.courseId), "B ve su propia entrega atrasada");
  const jsonB = JSON.stringify(homeB);
  for (const foreign of [A.courseId, A.course2Id, A.teacher.id, A.teacher2.id, "a_announcement", `${PREFIX}notice`]) {
    assert.equal(jsonB.includes(`"${foreign}"`), false, `B no ve ${foreign}`);
  }
  const homeA = await homeOf(A.coordinator, now);
  assert.equal(homeA.lateGrading.some((course) => course.courseId === B.courseId), false);

  await waitingSubmission(`${PREFIX}a_more`, A, new Date(now.getTime() - 12 * DAY));
  await db.announcement.create({
    data: { id: `${PREFIX}notice_a2`, institutionId: A.institutionId, authorId: A.admin.id, title: "Otro aviso de A", content: "Contenido del aviso", audienceInstitution: true, publishedAt: now },
  });
  assert.deepEqual(await homeOf(B.coordinator, now), homeB);
});
