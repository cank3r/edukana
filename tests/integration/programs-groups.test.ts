import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import {
  addGroupCourses,
  addGroupMembers,
  addProgramCoursesToGroup,
  createGroup,
  deleteGroup,
  enrollGroupInCourses,
  findStudentsToAdd,
  getGroup,
  listGroups,
  previewGroupEnrollment,
  removeGroupCourse,
  removeGroupMember,
  updateGroup,
} from "@/server/academic/groups";
import { addProgramCourses, createProgram, deleteProgram, getProgram, listPrograms, moveProgramCourse, removeProgramCourse, updateProgram } from "@/server/academic/programs";
import { A, B, ensureSeed } from "./setup";

const COURSES = ["pg_c1", "pg_c2", "pg_c3", "pg_small", "pg_race"];
const STUDENTS = ["pg_s3", "pg_s4", "pg_s5"];
const AUDITED = [
  "PROGRAM_CREATED", "PROGRAM_UPDATED", "PROGRAM_DELETED", "PROGRAM_COURSES_ADDED", "PROGRAM_COURSE_REMOVED", "PROGRAM_COURSES_REORDERED",
  "GROUP_CREATED", "GROUP_UPDATED", "GROUP_DELETED", "GROUP_MEMBERS_ADDED", "GROUP_MEMBER_REMOVED", "GROUP_COURSES_ADDED", "GROUP_COURSE_REMOVED", "GROUP_ENROLLED",
];

/** Todo lo de la institución B que esta pieza podría tocar por error. */
async function snapshotB() {
  const [enrollments, programs, groups, members, groupCourses, programCourses] = await Promise.all([
    db.enrollment.findMany({ where: { institutionId: B.institutionId }, orderBy: { id: "asc" }, select: { id: true, studentId: true, courseId: true, status: true } }),
    db.program.count({ where: { institutionId: B.institutionId } }),
    db.studentGroup.count({ where: { institutionId: B.institutionId } }),
    db.studentGroupMember.count({ where: { OR: [{ institutionId: B.institutionId }, { userId: { startsWith: "b_" } }] } }),
    db.studentGroupCourse.count({ where: { OR: [{ institutionId: B.institutionId }, { courseId: { startsWith: "b_" } }] } }),
    db.programCourse.count({ where: { OR: [{ institutionId: B.institutionId }, { courseId: { startsWith: "b_" } }] } }),
  ]);
  return { enrollments, programs, groups, members, groupCourses, programCourses };
}

let beforeB: Awaited<ReturnType<typeof snapshotB>>;
const ok = <T extends { ok: boolean }>(result: T) => {
  assert.ok(result.ok, `se esperaba éxito: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
};
const message = (result: { ok: boolean; message?: string }) => {
  assert.equal(result.ok, false, "se esperaba un rechazo");
  return result.message ?? "";
};
const activeIn = (courseId: string) => db.enrollment.count({ where: { courseId, status: "ACTIVE" } });

async function cleanup() {
  await db.enrollment.deleteMany({ where: { OR: [{ courseId: { in: COURSES } }, { studentId: { in: STUDENTS } }] } });
  await db.studentGroup.deleteMany({ where: { name: { startsWith: "PG " } } });
  await db.program.deleteMany({ where: { name: { startsWith: "PG " } } });
  await db.course.deleteMany({ where: { id: { in: COURSES } } });
  await db.user.deleteMany({ where: { id: { in: STUDENTS } } });
  await db.auditLog.deleteMany({ where: { action: { in: AUDITED } } });
}

before(async () => {
  await ensureSeed();
  await cleanup();
  await db.course.createMany({
    data: [
      { id: "pg_c1", name: "PG Anatomía" },
      { id: "pg_c2", name: "PG Biología" },
      { id: "pg_c3", name: "PG Cuidados" },
      { id: "pg_small", name: "PG Laboratorio", maxStudents: 2 },
      { id: "pg_race", name: "PG Práctica", maxStudents: 3 },
    ].map((course) => ({ ...course, institutionId: A.institutionId, periodId: "a_period", teacherId: A.teacher.id })),
  });
  await db.user.createMany({
    data: STUDENTS.map((id) => ({ id, institutionId: A.institutionId, name: `Estudiante ${id}`, email: `${id}@grupos.test`, role: "STUDENT" as const, status: "ACTIVE" as const })),
  });
  beforeB = await snapshotB();
});

after(async () => {
  await cleanup();
  await db.$disconnect();
});

test("programa: crear, editar, nombre repetido y aislamiento entre instituciones", async () => {
  assert.match(message(await createProgram(A.admin, { name: "  ", isPublished: true })), /nombre del programa/);
  const { programId } = ok(await createProgram(A.admin, { name: "  PG Enfermería ", description: " Carrera técnica ", isPublished: true }));
  const saved = await db.program.findUniqueOrThrow({ where: { id: programId } });
  assert.equal(saved.institutionId, A.institutionId);
  assert.equal(saved.name, "PG Enfermería");
  assert.equal(saved.description, "Carrera técnica");

  assert.match(message(await createProgram(A.admin, { name: "PG Enfermería", isPublished: true })), /Ya existe un programa/);
  // El mismo nombre en otra institución sí se puede: la unicidad es por institución.
  const other = ok(await createProgram(B.admin, { name: "PG Enfermería", isPublished: true }));

  ok(await updateProgram(A.admin, programId, { name: "PG Enfermería Técnica", description: "", isPublished: false }));
  const edited = await db.program.findUniqueOrThrow({ where: { id: programId } });
  assert.deepEqual([edited.name, edited.description, edited.isPublished], ["PG Enfermería Técnica", null, false]);

  // B no puede ver, editar ni borrar el programa de A.
  assert.equal(await getProgram(B.institutionId, programId), null);
  assert.match(message(await updateProgram(B.admin, programId, { name: "PG Robado", isPublished: true })), /No encontramos/);
  assert.match(message(await deleteProgram(B.admin, programId)), /No encontramos/);
  assert.match(message(await addProgramCourses(B.admin, programId, [B.courseId])), /No encontramos/);
  assert.equal((await db.program.findUniqueOrThrow({ where: { id: programId } })).name, "PG Enfermería Técnica");

  ok(await deleteProgram(B.admin, other.programId));
  assert.equal(await db.auditLog.count({ where: { action: "PROGRAM_CREATED", institutionId: A.institutionId, entityId: programId } }), 1);
  assert.equal(await db.auditLog.count({ where: { action: "PROGRAM_UPDATED", institutionId: A.institutionId, entityId: programId } }), 1);
  ok(await deleteProgram(A.admin, programId));
});

test("programa: agregar cursos de la institución, sin repetir, reordenar con Subir/Bajar y quitar", async () => {
  const { programId } = ok(await createProgram(A.admin, { name: "PG Orden", isPublished: true }));
  const order = async () => (await getProgram(A.institutionId, programId))!.courses.map((row) => row.courseId);

  // Un curso de B invalida toda la selección: no se agrega nada.
  assert.match(message(await addProgramCourses(A.admin, programId, ["pg_c1", B.courseId])), /ya no está disponible/);
  assert.deepEqual(await order(), []);

  assert.equal(ok(await addProgramCourses(A.admin, programId, ["pg_c1", "pg_c2"])).added, 2);
  assert.equal(ok(await addProgramCourses(A.admin, programId, ["pg_c2", "pg_c3", "pg_c3"])).added, 1, "el curso que ya estaba no se repite");
  assert.deepEqual(await order(), ["pg_c1", "pg_c2", "pg_c3"]);

  ok(await moveProgramCourse(A.admin, programId, "pg_c3", "up"));
  assert.deepEqual(await order(), ["pg_c1", "pg_c3", "pg_c2"]);
  ok(await moveProgramCourse(A.admin, programId, "pg_c1", "down"));
  assert.deepEqual(await order(), ["pg_c3", "pg_c1", "pg_c2"]);
  // Subir el primero o bajar el último no cambia nada.
  ok(await moveProgramCourse(A.admin, programId, "pg_c3", "up"));
  ok(await moveProgramCourse(A.admin, programId, "pg_c2", "down"));
  assert.deepEqual(await order(), ["pg_c3", "pg_c1", "pg_c2"]);
  assert.match(message(await moveProgramCourse(B.admin, programId, "pg_c3", "down")), /No encontramos/);

  ok(await removeProgramCourse(A.admin, programId, "pg_c1"));
  assert.deepEqual(await order(), ["pg_c3", "pg_c2"]);
  assert.match(message(await removeProgramCourse(B.admin, programId, "pg_c3")), /ya no estaba/);
  assert.equal(await db.course.count({ where: { id: "pg_c1" } }), 1, "quitar del programa no borra el curso");

  const listed = (await listPrograms(A.institutionId)).find((program) => program.id === programId);
  assert.equal(listed?._count.courses, 2);
  ok(await deleteProgram(A.admin, programId));
  assert.equal(await db.course.count({ where: { id: { in: ["pg_c2", "pg_c3"] } } }), 2, "borrar el programa no borra cursos");
});

test("grupo: crear, validar fechas y cupo, editar; borrar el programa deja al grupo sin programa", async () => {
  const { programId } = ok(await createProgram(A.admin, { name: "PG Carrera", isPublished: true }));
  const programB = ok(await createProgram(B.admin, { name: "PG Carrera B", isPublished: true }));
  const base = { name: "PG Enfermería 2027 — Noche", startsOn: "2027-01-15" };

  assert.match(message(await createGroup(A.admin, { ...base, startsOn: "" })), /fecha de inicio/);
  assert.match(message(await createGroup(A.admin, { ...base, startsOn: "2027-02-30" })), /fecha de inicio/);
  assert.match(message(await createGroup(A.admin, { ...base, endsOn: "2027-01-14" })), /no puede ser anterior/);
  assert.match(message(await createGroup(A.admin, { ...base, capacity: "-3" })), /cupo/i);
  assert.match(message(await createGroup(A.admin, { ...base, capacity: "0" })), /cupo/i);
  assert.match(message(await createGroup(A.admin, { ...base, programId: programB.programId })), /programa ya no existe/);
  assert.equal(await db.studentGroup.count({ where: { name: base.name } }), 0);

  const { groupId } = ok(await createGroup(A.admin, { ...base, programId, endsOn: "2027-01-15", capacity: "30", description: " Turno de noche " }));
  const saved = await db.studentGroup.findUniqueOrThrow({ where: { id: groupId } });
  assert.equal(saved.institutionId, A.institutionId);
  assert.equal(saved.programId, programId);
  assert.equal(saved.startsOn.toISOString().slice(0, 10), "2027-01-15");
  assert.equal(saved.endsOn?.toISOString().slice(0, 10), "2027-01-15");
  assert.equal(saved.capacity, 30);
  assert.equal(saved.description, "Turno de noche");
  assert.match(message(await createGroup(A.admin, base)), /Ya existe un grupo/);

  ok(await updateGroup(A.admin, groupId, { name: "PG Enfermería 2027 — Día", startsOn: "2027-02-01", endsOn: "", capacity: "", programId }));
  const edited = await db.studentGroup.findUniqueOrThrow({ where: { id: groupId } });
  assert.deepEqual([edited.name, edited.endsOn, edited.capacity, edited.description], ["PG Enfermería 2027 — Día", null, null, null]);
  assert.match(message(await updateGroup(A.admin, groupId, { name: "PG X grupo", startsOn: "2027-02-01", endsOn: "2027-01-01" })), /no puede ser anterior/);

  // B no ve ni toca el grupo de A.
  assert.equal(await getGroup(B.institutionId, groupId), null);
  assert.equal(await previewGroupEnrollment(B.institutionId, groupId), null);
  assert.match(message(await updateGroup(B.admin, groupId, { name: "PG Robado", startsOn: "2027-02-01" })), /No encontramos/);
  assert.match(message(await deleteGroup(B.admin, groupId)), /No encontramos/);
  assert.match(message(await enrollGroupInCourses(B.admin, groupId)), /No encontramos/);

  const deleted = ok(await deleteProgram(A.admin, programId));
  assert.equal(deleted.groupsDetached, 1);
  assert.equal((await db.studentGroup.findUniqueOrThrow({ where: { id: groupId } })).programId, null, "el grupo se conserva sin programa");
  ok(await deleteGroup(A.admin, groupId));
  ok(await deleteProgram(B.admin, programB.programId));
});

test("estudiantes del grupo: solo estudiantes activos de la misma institución y respetando el cupo", async () => {
  const { groupId } = ok(await createGroup(A.admin, { name: "PG Miembros", startsOn: "2027-01-15", capacity: "3" }));
  const members = async () => (await db.studentGroupMember.findMany({ where: { groupId }, orderBy: { userId: "asc" } })).map((row) => row.userId);

  // Cualquier id que no sea un estudiante activo de A invalida toda la selección.
  for (const intruder of [B.student.id, A.teacher.id, A.parent.id, "a_suspended", "no_existe"]) {
    assert.match(message(await addGroupMembers(A.admin, groupId, [A.student.id, intruder])), /estudiantes activos de tu institución/, intruder);
  }
  assert.match(message(await addGroupMembers(B.admin, groupId, [B.student.id])), /No encontramos/);
  assert.deepEqual(await members(), []);

  const candidates = (await findStudentsToAdd(A.institutionId, groupId, "")).map((student) => student.id);
  assert.ok(candidates.includes(A.student.id) && candidates.includes("pg_s3"));
  assert.ok(!candidates.includes("a_suspended") && !candidates.includes(A.teacher.id) && !candidates.some((id) => id.startsWith("b_")));
  assert.deepEqual((await findStudentsToAdd(A.institutionId, groupId, "PG_S4@grupos")).map((student) => student.id), ["pg_s4"]);

  assert.equal(ok(await addGroupMembers(A.admin, groupId, [A.student.id, A.student2.id])).added, 2);
  assert.equal(ok(await addGroupMembers(A.admin, groupId, [A.student.id])).added, 0, "quien ya está no se duplica");
  assert.ok(!(await findStudentsToAdd(A.institutionId, groupId, "")).some((student) => student.id === A.student.id));

  // Queda 1 cupo: dos personas nuevas no caben y no se agrega a ninguna.
  assert.match(message(await addGroupMembers(A.admin, groupId, ["pg_s3", "pg_s4"])), /queda 1 cupo/);
  assert.deepEqual(await members(), [A.student.id, A.student2.id]);
  assert.equal(ok(await addGroupMembers(A.admin, groupId, ["pg_s3"])).added, 1);
  assert.match(message(await addGroupMembers(A.admin, groupId, ["pg_s4"])), /no quedan cupos/);
  assert.match(message(await updateGroup(A.admin, groupId, { name: "PG Miembros", startsOn: "2027-01-15", capacity: "2" })), /ya tiene 3 estudiantes/);

  // Dos personas compiten por el último cupo a la vez: solo entra una.
  ok(await removeGroupMember(A.admin, groupId, "pg_s3"));
  const race = await Promise.all([addGroupMembers(A.admin, groupId, ["pg_s4"]), addGroupMembers(A.admin, groupId, ["pg_s5"])]);
  assert.equal(race.filter((result) => result.ok).length, 1);
  assert.equal((await members()).length, 3);

  assert.match(message(await removeGroupMember(B.admin, groupId, A.student.id)), /ya no estaba/);
  ok(await removeGroupMember(A.admin, groupId, A.student.id));
  assert.equal((await members()).length, 2);
  assert.equal((await listGroups(A.institutionId)).find((group) => group.id === groupId)?._count.members, 2);
  // Una fila de auditoría por operación, no por estudiante.
  assert.equal(await db.auditLog.count({ where: { action: "GROUP_MEMBERS_ADDED", entityId: groupId } }), 3);
  ok(await deleteGroup(A.admin, groupId));
});

test("cursos del grupo: de la misma institución, sin repetir, y todos los del programa de una vez", async () => {
  const { programId } = ok(await createProgram(A.admin, { name: "PG Con cursos", isPublished: true }));
  ok(await addProgramCourses(A.admin, programId, ["pg_c1", "pg_c2", "pg_c3"]));
  const { groupId } = ok(await createGroup(A.admin, { name: "PG Cursos", startsOn: "2027-01-15", programId }));
  const courses = async () => (await db.studentGroupCourse.findMany({ where: { groupId }, orderBy: { courseId: "asc" } })).map((row) => row.courseId);

  assert.match(message(await addGroupCourses(A.admin, groupId, ["pg_c1", B.courseId])), /ya no está disponible/);
  assert.match(message(await addGroupCourses(B.admin, groupId, [B.courseId])), /No encontramos/);
  assert.deepEqual(await courses(), []);

  assert.equal(ok(await addGroupCourses(A.admin, groupId, ["pg_c1"])).added, 1);
  assert.equal(ok(await addGroupCourses(A.admin, groupId, ["pg_c1"])).added, 0, "un curso no se repite en el grupo");
  assert.equal(ok(await addProgramCoursesToGroup(A.admin, groupId)).added, 2, "solo se agregan los que faltaban");
  assert.deepEqual(await courses(), ["pg_c1", "pg_c2", "pg_c3"]);

  assert.match(message(await removeGroupCourse(B.admin, groupId, "pg_c1")), /ya no estaba/);
  ok(await removeGroupCourse(A.admin, groupId, "pg_c1"));
  assert.deepEqual(await courses(), ["pg_c2", "pg_c3"]);

  const loose = ok(await createGroup(A.admin, { name: "PG Sin programa", startsOn: "2027-01-15" }));
  assert.match(message(await addProgramCoursesToGroup(A.admin, loose.groupId)), /no tiene programa/);
  ok(await deleteGroup(A.admin, loose.groupId));
  ok(await deleteGroup(A.admin, groupId));
  ok(await deleteProgram(A.admin, programId));
});

test("inscribir al grupo: crea lo que falta, es idempotente, no reactiva retirados y borrar el grupo conserva las matrículas", async () => {
  const { groupId } = ok(await createGroup(A.admin, { name: "PG Inscribir", startsOn: "2027-01-15" }));
  assert.match(message(await enrollGroupInCourses(A.admin, groupId)), /no tiene estudiantes/);
  ok(await addGroupMembers(A.admin, groupId, [A.student.id, A.student2.id, "pg_s3"]));
  assert.match(message(await enrollGroupInCourses(A.admin, groupId)), /no tiene cursos/);
  ok(await addGroupCourses(A.admin, groupId, ["pg_c1", "pg_c2"]));

  // Uno ya estaba inscrito en pg_c1 y otro se retiró de pg_c2.
  await db.enrollment.create({ data: { institutionId: A.institutionId, studentId: A.student.id, courseId: "pg_c1", status: "ACTIVE" } });
  await db.enrollment.create({ data: { institutionId: A.institutionId, studentId: "pg_s3", courseId: "pg_c2", status: "DROPPED", withdrawnAt: new Date(), withdrawReason: "Cambio de horario" } });

  const preview = (await previewGroupEnrollment(A.institutionId, groupId))!;
  assert.equal(preview.students, 3);
  const [c1, c2] = preview.courses;
  assert.deepEqual([c1.courseId, c1.toEnroll, c1.alreadyEnrolled, c1.withdrawn, c1.blocked], ["pg_c1", 2, 1, [], null]);
  assert.deepEqual([c2.courseId, c2.toEnroll, c2.alreadyEnrolled, c2.withdrawn, c2.blocked], ["pg_c2", 2, 0, ["Estudiante pg_s3"], null]);
  assert.equal(await db.enrollment.count({ where: { courseId: { in: ["pg_c1", "pg_c2"] } } }), 2, "el resumen previo no cambia nada");

  const first = ok(await enrollGroupInCourses(A.admin, groupId));
  assert.equal(first.enrolled, 4);
  assert.deepEqual(first.courses.map((course) => course.enrolled), [2, 2]);
  assert.equal(await activeIn("pg_c1"), 3);
  assert.equal(await activeIn("pg_c2"), 2);
  const created = await db.enrollment.findMany({ where: { courseId: "pg_c2", status: "ACTIVE" } });
  assert.ok(created.every((row) => row.institutionId === A.institutionId));

  // Repetirlo no crea ni cambia nada.
  const second = ok(await enrollGroupInCourses(A.admin, groupId));
  assert.equal(second.enrolled, 0);
  assert.deepEqual(second.courses.map((course) => [course.toEnroll, course.alreadyEnrolled]), [[0, 3], [0, 2]]);
  assert.equal(await db.enrollment.count({ where: { courseId: { in: ["pg_c1", "pg_c2"] } } }), 6);

  // Quien se retiró sigue retirado, con su motivo.
  const dropped = await db.enrollment.findUniqueOrThrow({ where: { studentId_courseId: { studentId: "pg_s3", courseId: "pg_c2" } } });
  assert.deepEqual([dropped.status, dropped.withdrawReason], ["DROPPED", "Cambio de horario"]);
  assert.deepEqual(second.courses[1].withdrawn, ["Estudiante pg_s3"]);

  // Una fila de auditoría por operación, no por estudiante ni por curso.
  const audit = await db.auditLog.findMany({ where: { action: "GROUP_ENROLLED", entityId: groupId }, orderBy: { createdAt: "asc" } });
  assert.equal(audit.length, 2);
  assert.equal((audit[0].changes as { enrolled: number }).enrolled, 4);
  assert.equal(audit[0].userId, A.admin.id);

  // Quitar un curso, quitar a un estudiante o borrar el grupo no deshace matrículas.
  ok(await removeGroupCourse(A.admin, groupId, "pg_c1"));
  ok(await removeGroupMember(A.admin, groupId, A.student2.id));
  ok(await deleteGroup(A.admin, groupId));
  assert.equal(await db.studentGroupMember.count({ where: { groupId } }), 0);
  assert.equal(await db.studentGroupCourse.count({ where: { groupId } }), 0);
  assert.equal(await activeIn("pg_c1"), 3);
  assert.equal(await activeIn("pg_c2"), 2);
  assert.equal(await db.user.count({ where: { id: { in: [A.student.id, A.student2.id, "pg_s3"] } } }), 3);
});

test("inscribir al grupo: un curso sin cupo para todos no se toca y los demás sí; un suspendido no se inscribe", async () => {
  const { groupId } = ok(await createGroup(A.admin, { name: "PG Cupo", startsOn: "2027-01-15" }));
  ok(await addGroupMembers(A.admin, groupId, [A.student.id, A.student2.id, "pg_s4"]));
  ok(await addGroupCourses(A.admin, groupId, ["pg_small", "pg_c3"]));

  const preview = (await previewGroupEnrollment(A.institutionId, groupId))!;
  const small = preview.courses.find((course) => course.courseId === "pg_small")!;
  assert.deepEqual([small.toEnroll, small.blocked, small.seatsLeft], [3, "full", 2]);

  const result = ok(await enrollGroupInCourses(A.admin, groupId));
  const byCourse = new Map(result.courses.map((course) => [course.courseId, course]));
  assert.deepEqual([byCourse.get("pg_small")!.enrolled, byCourse.get("pg_small")!.blocked], [0, "full"]);
  assert.deepEqual([byCourse.get("pg_c3")!.enrolled, byCourse.get("pg_c3")!.blocked], [3, null]);
  assert.equal(await db.enrollment.count({ where: { courseId: "pg_small" } }), 0, "el curso sin cupo no se toca");
  assert.equal(await activeIn("pg_c3"), 3);

  // Si alguien queda suspendido, deja de contarse: ahora caben los dos que siguen activos.
  await db.user.update({ where: { id: "pg_s4" }, data: { status: "SUSPENDED" } });
  const retry = ok(await enrollGroupInCourses(A.admin, groupId));
  assert.equal(retry.students, 2);
  assert.equal(await activeIn("pg_small"), 2);
  assert.equal(await db.enrollment.count({ where: { courseId: "pg_small", studentId: "pg_s4" } }), 0);
  await db.user.update({ where: { id: "pg_s4" }, data: { status: "ACTIVE" } });
  ok(await deleteGroup(A.admin, groupId));
});

test("inscribir al grupo: dos ejecuciones simultáneas no duplican ni pasan el cupo del curso", async () => {
  // Mismo grupo dos veces a la vez: cada matrícula se crea una sola vez.
  const same = ok(await createGroup(A.admin, { name: "PG Doble clic", startsOn: "2027-01-15" }));
  ok(await addGroupMembers(A.admin, same.groupId, [A.student.id, A.student2.id, "pg_s5"]));
  ok(await addGroupCourses(A.admin, same.groupId, ["pg_race"]));
  const twice = await Promise.all([enrollGroupInCourses(A.admin, same.groupId), enrollGroupInCourses(A.admin, same.groupId)]);
  assert.equal(twice.reduce((sum, result) => sum + ok(result).enrolled, 0), 3);
  assert.equal(await db.enrollment.count({ where: { courseId: "pg_race" } }), 3);
  await db.enrollment.deleteMany({ where: { courseId: "pg_race" } });
  ok(await deleteGroup(A.admin, same.groupId));

  // Dos grupos de 2 compiten por un curso de 3 cupos: entra uno completo y el otro no se toca.
  const one = ok(await createGroup(A.admin, { name: "PG Carrera 1", startsOn: "2027-01-15" }));
  const two = ok(await createGroup(A.admin, { name: "PG Carrera 2", startsOn: "2027-01-15" }));
  ok(await addGroupMembers(A.admin, one.groupId, [A.student.id, A.student2.id]));
  ok(await addGroupMembers(A.admin, two.groupId, ["pg_s3", "pg_s4"]));
  ok(await addGroupCourses(A.admin, one.groupId, ["pg_race"]));
  ok(await addGroupCourses(A.admin, two.groupId, ["pg_race"]));
  const race = (await Promise.all([enrollGroupInCourses(A.admin, one.groupId), enrollGroupInCourses(A.admin, two.groupId)])).map((result) => ok(result));
  assert.deepEqual(race.map((result) => result.enrolled).sort(), [0, 2]);
  assert.equal(race.filter((result) => result.courses[0].blocked === "full").length, 1);
  assert.equal(await activeIn("pg_race"), 2);
  const winners = (await db.enrollment.findMany({ where: { courseId: "pg_race" }, orderBy: { studentId: "asc" } })).map((row) => row.studentId);
  assert.ok(
    JSON.stringify(winners) === JSON.stringify([A.student.id, A.student2.id].sort()) || JSON.stringify(winners) === JSON.stringify(["pg_s3", "pg_s4"]),
    "entra un grupo completo, nunca mitad y mitad",
  );
  ok(await deleteGroup(A.admin, one.groupId));
  ok(await deleteGroup(A.admin, two.groupId));
});

test("nada de la institución B cambió y la semilla de A quedó intacta", async () => {
  assert.deepEqual(await snapshotB(), beforeB);
  const seeded = await db.enrollment.findMany({ where: { courseId: { in: [A.courseId, A.course2Id] } }, select: { id: true, status: true } });
  assert.deepEqual(seeded, [{ id: "a_enrollment", status: "ACTIVE" }]);
  assert.equal(await db.program.count({ where: { institutionId: { in: [A.institutionId, B.institutionId] } } }), 0);
  assert.equal(await db.studentGroup.count({ where: { institutionId: { in: [A.institutionId, B.institutionId] } } }), 0);
});
