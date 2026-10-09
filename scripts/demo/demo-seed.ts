/**
 * Institución de demostración «Instituto Técnico Demo».
 *
 * `createDemo` crea UNA institución nueva (siempre con el mismo identificador) con personas,
 * cursos con contenido, tareas, exámenes, notas, asistencia, clases en vivo, avisos, certificados,
 * cobros, admisiones y catálogo. Casi todo pasa por las mismas funciones del servidor que usan
 * las pantallas, así los datos quedan igual que si alguien los hubiera cargado a mano.
 * Se escribe directo en la base solo lo que no tiene función propia (avisos, horario, tutores,
 * catálogo) y el avance de lecciones, que se carga en bloque con el mismo cálculo de porcentaje.
 *
 * `removeDemo` borra SOLO esa institución y las cuentas `@demo.edukana.do` que no pertenezcan a
 * ninguna otra institución, en una sola transacción. Nunca toca otras instituciones.
 *
 * Este archivo no se ejecuta solo: lo usan `seed-demo.ts` (la línea de comandos) y la prueba
 * `tests/integration/demo-seed.test.ts`.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { progressPercentage } from "@/lib/lms";
import { addDaysToDateKey, zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";
import { addGroupMembers, addProgramCoursesToGroup, createGroup, enrollGroupInCourses } from "@/server/academic/groups";
import { createPeriod } from "@/server/academic/periods";
import { addProgramCourses, createProgram } from "@/server/academic/programs";
import { createLead, moveLeadStage } from "@/server/admissions/leads";
import { gradeSubmission, saveAssignment, submitAssignment } from "@/server/assessment/assignments";
import { createExam, setExamPublished } from "@/server/assessment/exam-admin";
import { saveCategories, setupSimpleGrading } from "@/server/assessment/gradebook";
import { createQuestion } from "@/server/assessment/question-bank";
import { saveAttendance, type AttendanceEntry } from "@/server/courses/attendance";
import { issueCertificate, markCourseCompleted } from "@/server/courses/certificates";
import { createChapter, createLesson, setChapterPublished, setLessonPublished } from "@/server/courses/content";
import { createCourse, setCoursePublished } from "@/server/courses/course";
import { enrollStudents, withdrawStudent } from "@/server/courses/enrollment";
import { createLiveClasses } from "@/server/courses/live-classes";
import { startExamAttempt, submitExamAttempt } from "@/server/exams";
import { createCharge, createGroupCharges, recordPayment } from "@/server/finance/charges";
import { ensureIdentity } from "@/server/identity";
import { createPerson } from "@/server/people/create";
import type { EdukanaRole } from "@/types/next-auth";
import {
  ADMIN,
  COORDINATOR,
  COURSES,
  DEMO_EMAIL_DOMAIN,
  GUARDIANS,
  LEADS,
  PROGRAMS,
  STUDENTS,
  TEACHERS,
  type DemoCourse,
  type DemoQuestion,
  type DemoStudent,
  type StudentProfile,
  type TeacherKey,
} from "./content";

export { DEMO_EMAIL_DOMAIN };
export const DEMO_SLUG = "instituto-tecnico-demo";
export const DEMO_NAME = "Instituto Técnico Demo";
const TIME_ZONE = "America/Santo_Domingo";
const DAY_MS = 24 * 60 * 60 * 1000;

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type Log = (message: string) => void;

export type DemoAccount = { role: string; name: string; email: string };
export type CreateDemoResult =
  | { created: false; institutionId: string }
  | { created: true; institutionId: string; accounts: DemoAccount[]; warnings: string[] };

export type CreateDemoOptions = {
  /** Contraseña de todas las cuentas de demostración. */
  password: string;
  /** «Hoy» para las fechas relativas. Por defecto, ahora. */
  now?: Date;
  /** Cuántas operaciones se lanzan a la vez contra la base. */
  concurrency?: number;
  log?: Log;
};

/** La institución de demostración, si ya existe en esta base. */
export function findDemoInstitution() {
  return db.institution.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true, name: true, createdAt: true } });
}

// ---------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------

/** Azar reproducible: la misma semilla da siempre la misma secuencia. Así dos cargas son iguales. */
function random(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (next: () => number, min: number, max: number) => min + Math.floor(next() * (max - min + 1));
const pick = <T>(next: () => number, items: readonly T[]): T => items[Math.floor(next() * items.length)];

function must<T extends { ok: boolean }>(step: string, result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`Demo: falló «${step}»: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

/** Recorre `items` con hasta `limit` operaciones a la vez. */
async function eachLimit<T>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthOf = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
const demoEmail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Día de la semana de una fecha AAAA-MM-DD: 1 = lunes … 7 = domingo. */
function weekdayOf(key: string) {
  const day = new Date(`${key}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

const PROFILE: Record<StudentProfile, {
  progress: [number, number];
  present: number;
  late: number;
  firstTask: { submit: number; late: number; score: [number, number] };
  secondTask: number;
  exam: { take: number; correct: number; retry: number };
}> = {
  destacado: { progress: [0.85, 1], present: 0.95, late: 0.03, firstTask: { submit: 1, late: 0, score: [88, 100] }, secondTask: 0.85, exam: { take: 1, correct: 0.93, retry: 0.1 } },
  regular: { progress: [0.55, 0.85], present: 0.86, late: 0.07, firstTask: { submit: 0.95, late: 0.15, score: [72, 90] }, secondTask: 0.35, exam: { take: 0.95, correct: 0.76, retry: 0.3 } },
  atrasado: { progress: [0.25, 0.5], present: 0.76, late: 0.1, firstTask: { submit: 0.55, late: 0.8, score: [60, 78] }, secondTask: 0, exam: { take: 0.5, correct: 0.6, retry: 0 } },
  en_riesgo: { progress: [0.05, 0.3], present: 0.55, late: 0.12, firstTask: { submit: 0.4, late: 1, score: [40, 62] }, secondTask: 0, exam: { take: 0.6, correct: 0.4, retry: 0.5 } },
};

const ABSENCE_NOTES = ["Avisó por WhatsApp que estaba enferma.", "Cita médica.", "Problema con el transporte.", "No avisó.", "Turno extra en el trabajo."];
const FEEDBACK: Array<[number, string[]]> = [
  [90, ["Excelente trabajo, muy completo y bien explicado.", "Muy bien. Se nota que repasaste las lecciones.", "Trabajo claro y ordenado. ¡Sigue así!"]],
  [75, ["Buen trabajo. Te faltó desarrollar un poco más el último punto.", "Bien hecho; revisa la presentación y las unidades.", "Correcto en general. Agrega ejemplos propios la próxima vez."]],
  [60, ["Vas por buen camino, pero faltan partes de la consigna. Pasa por consulta.", "Revisa las lecciones de la unidad y corrige los errores marcados.", "Incompleto. Lee otra vez las instrucciones antes de entregar."]],
  [0, ["Faltan la mayoría de los puntos pedidos. Hablemos en la próxima clase.", "Necesitas reforzar este tema. Te recomiendo la tutoría del sábado."]],
];
const feedbackFor = (next: () => number, percent: number) => pick(next, FEEDBACK.find(([min]) => percent >= min)?.[1] ?? FEEDBACK[FEEDBACK.length - 1][1]);

// ---------------------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------------------

/**
 * Crea la institución de demostración. Si ya existe, no crea nada y devuelve `created: false`.
 * Si algo falla a mitad de camino, borra lo que alcanzó a crear y vuelve a lanzar el error.
 */
export async function createDemo(options: CreateDemoOptions): Promise<CreateDemoResult> {
  const log: Log = options.log ?? (() => undefined);
  const existing = await findDemoInstitution();
  if (existing) return { created: false, institutionId: existing.id };

  const now = options.now ?? new Date();
  const passwordHash = await bcrypt.hash(options.password, 10);

  // La institución y su directora nacen juntas, como cuando la crea el operador de la plataforma.
  const created = await db.$transaction(async (tx) => {
    const institution = await tx.institution.create({
      data: { name: DEMO_NAME, slug: DEMO_SLUG, type: "INSTITUTE", timezone: TIME_ZONE, language: "es", brandColor: "#0E7490" },
      select: { id: true },
    });
    const identityId = await ensureIdentity(tx, { email: ADMIN.email });
    const admin = await tx.user.create({
      data: { identityId, institutionId: institution.id, name: ADMIN.name, email: ADMIN.email, phone: ADMIN.phone, role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: { institutionId: institution.id, userId: admin.id, action: "INSTITUTION_CREATED", entity: "Institution", entityId: institution.id, changes: { slug: DEMO_SLUG, source: "demo-seed" } },
    });
    return { institutionId: institution.id, adminId: admin.id };
  });

  try {
    const warnings = await fill(created.institutionId, created.adminId, passwordHash, now, Math.max(1, options.concurrency ?? 3), log);
    const accounts: DemoAccount[] = [
      { role: "Administración", name: ADMIN.name, email: ADMIN.email },
      { role: "Coordinación", name: COORDINATOR.name, email: COORDINATOR.email },
      { role: "Docente", name: TEACHERS.rosa.name, email: TEACHERS.rosa.email },
      { role: "Docente", name: TEACHERS.ramon.name, email: TEACHERS.ramon.email },
      { role: "Estudiante", name: "Ana Mercedes Reyes", email: demoEmail("ana.reyes") },
      { role: "Estudiante en riesgo", name: "Yaritza Mejía Lora", email: demoEmail("yaritza.mejia") },
      { role: "Tutor", name: GUARDIANS[0].name, email: GUARDIANS[0].email },
    ];
    return { created: true, institutionId: created.institutionId, accounts, warnings };
  } catch (error) {
    log("Algo falló. Se borra lo que se alcanzó a crear de la demostración…");
    await removeDemoInstitution(created.institutionId);
    throw error;
  }
}

async function fill(institutionId: string, adminId: string, passwordHash: string, now: Date, concurrency: number, log: Log): Promise<string[]> {
  const warnings: string[] = [];
  const dayKey = (offset: number) => zonedDateKey(new Date(now.getTime() + offset * DAY_MS), TIME_ZONE);
  const at = (offset: number, time: string) => {
    const instant = zonedTimeToUtc(dayKey(offset), time, TIME_ZONE);
    if (!instant) throw new Error(`Demo: hora no válida ${time}`);
    return instant;
  };
  const clock = (next: () => number, fromHour: number, toHour: number) => `${String(between(next, fromHour, toHour)).padStart(2, "0")}:${String(between(next, 0, 59)).padStart(2, "0")}`;
  const year = Number(dayKey(0).slice(0, 4));
  const admin: Actor = { id: adminId, institutionId, role: "ADMIN" };

  // --- Personas ------------------------------------------------------------------------------------
  log("Creando personas…");
  const people = [
    { ...COORDINATOR, role: "COORDINATOR" },
    ...Object.values(TEACHERS).map((teacher) => ({ ...teacher, role: "TEACHER" })),
    ...STUDENTS.map((student) => ({ ...student, role: "STUDENT" })),
    ...GUARDIANS.map((guardian) => ({ ...guardian, role: "PARENT" })),
  ];
  const userIdByEmail = new Map<string, string>([[ADMIN.email, adminId]]);
  await eachLimit(people, concurrency, async (person) => {
    const result = must(`persona ${person.email}`, await createPerson(admin, { name: person.name, email: person.email, role: person.role, phone: person.phone }));
    userIdByEmail.set(person.email, result.userId);
  });
  const userId = (email: string) => {
    const id = userIdByEmail.get(email);
    if (!id) throw new Error(`Demo: falta la persona ${email}`);
    return id;
  };

  // Misma contraseña para todas, salvo una identidad que ya existiera en otra institución.
  const emails = [ADMIN.email, ...people.map((person) => person.email)];
  const identities = await db.identity.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, users: { select: { institutionId: true } } } });
  const own = identities.filter((identity) => identity.users.every((user) => user.institutionId === institutionId));
  await db.identity.updateMany({ where: { id: { in: own.map((identity) => identity.id) } }, data: { passwordHash, status: "ACTIVE" } });
  for (const identity of identities) {
    if (!own.includes(identity)) warnings.push(`La cuenta ${identity.email} ya existía en otra institución: se dejó con su contraseña de siempre.`);
  }

  const coordinator: Actor = { id: userId(COORDINATOR.email), institutionId, role: "COORDINATOR" };
  const teacherActor = (key: TeacherKey): Actor => ({ id: userId(TEACHERS[key].email), institutionId, role: "TEACHER" });
  const teacherCapabilities = await getEffectiveCapabilities(institutionId, "TEACHER");
  const adminCapabilities = await getEffectiveCapabilities(institutionId, "ADMIN");
  const adminScope = resolveCourseWriteScope(admin, adminCapabilities);

  // --- Períodos: el actual (empezó hace 7 semanas) y el anterior -----------------------------------
  log("Creando períodos…");
  const periodName = (start: string, end: string) =>
    start.slice(0, 4) === end.slice(0, 4)
      ? `Cuatrimestre ${capital(monthOf(start))}–${capital(monthOf(end))} ${start.slice(0, 4)}`
      : `Cuatrimestre ${capital(monthOf(start))} ${start.slice(0, 4)}–${capital(monthOf(end))} ${end.slice(0, 4)}`;
  const current = { start: dayKey(-49), end: dayKey(70) };
  const previous = { start: dayKey(-170), end: dayKey(-50) };
  const currentPeriod = must("período actual", await createPeriod(admin, { name: periodName(current.start, current.end), startDate: current.start, endDate: current.end }));
  must("período anterior", await createPeriod(admin, { name: periodName(previous.start, previous.end), startDate: previous.start, endDate: previous.end }));

  // --- Cursos con su contenido ---------------------------------------------------------------------
  log("Creando cursos, capítulos y lecciones…");
  type BuiltCourse = { data: DemoCourse; id: string; teacher: Actor; lessons: Array<{ id: string; title: string; minutes: number }>; categories: { tasks: string; exams: string } };
  const built: BuiltCourse[] = [];
  await eachLimit(COURSES, concurrency, async (data) => {
    const teacher = teacherActor(data.teacher);
    const course = must(`curso ${data.code}`, await createCourse(admin, adminScope, {
      name: data.name,
      description: data.description,
      teacherId: teacher.id,
      periodId: currentPeriod.periodId,
      code: data.code,
      maxStudents: data.maxStudents,
    }));
    for (const chapter of data.chapters) {
      const createdChapter = must(`capítulo ${chapter.title}`, await createChapter(teacher, course.courseId, { title: chapter.title, description: chapter.description }));
      if (!createdChapter.id) throw new Error("Demo: el capítulo no devolvió su id.");
      must("publicar capítulo", await setChapterPublished(teacher, createdChapter.id, true));
      for (const lesson of chapter.lessons) {
        const createdLesson = must(`lección ${lesson.title}`, await createLesson(teacher, createdChapter.id, {
          title: lesson.title,
          summary: lesson.summary,
          type: lesson.type,
          content: lesson.content,
          estimatedMinutes: lesson.minutes,
        }));
        if (!createdLesson.id) throw new Error("Demo: la lección no devolvió su id.");
        if (!lesson.draft) must("publicar lección", await setLessonPublished(teacher, createdLesson.id, true));
      }
    }
    must(`publicar ${data.code}`, await setCoursePublished(admin, adminScope, course.courseId, true));

    // Libro de calificaciones: tareas 40 % y exámenes 60 %.
    must("configuración de notas", await setupSimpleGrading(teacher, course.courseId));
    const gradingPeriod = await db.gradingPeriod.findFirstOrThrow({ where: { institutionId, courseId: course.courseId }, select: { id: true, categories: { select: { id: true } } } });
    must("categorías", await saveCategories(teacher, {
      courseId: course.courseId,
      gradingPeriodId: gradingPeriod.id,
      categories: [{ id: gradingPeriod.categories[0].id, name: "Tareas", weight: 40 }, { name: "Exámenes", weight: 60 }],
    }));
    const categories = await db.gradeCategory.findMany({ where: { institutionId, courseId: course.courseId }, select: { id: true, name: true } });
    const lessons = await db.lesson.findMany({
      where: { institutionId, courseId: course.courseId, isPublished: true, section: { isPublished: true } },
      orderBy: [{ section: { order: "asc" } }, { order: "asc" }],
      select: { id: true, title: true, estimatedMinutes: true },
    });
    built.push({
      data,
      id: course.courseId,
      teacher,
      lessons: lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, minutes: lesson.estimatedMinutes })),
      categories: {
        tasks: categories.find((category) => category.name === "Tareas")!.id,
        exams: categories.find((category) => category.name === "Exámenes")!.id,
      },
    });
  });
  built.sort((a, b) => COURSES.indexOf(a.data) - COURSES.indexOf(b.data));
  const courseByCode = (code: string) => built.find((course) => course.data.code === code)!;

  // Horario semanal (no tiene función propia en el servidor nuevo).
  await db.scheduleSlot.createMany({
    data: built.flatMap((course) =>
      course.data.schedule.map((slot) => ({
        institutionId,
        courseId: course.id,
        teacherId: course.teacher.id,
        weekday: slot.weekday,
        startMinutes: slot.start,
        endMinutes: slot.end,
        classroom: slot.room,
        startsOn: new Date(`${current.start}T00:00:00.000Z`),
        endsOn: new Date(`${current.end}T00:00:00.000Z`),
      })),
    ),
  });

  // --- Programas, grupos e inscripciones -----------------------------------------------------------
  log("Creando programas y grupos, e inscribiendo estudiantes…");
  for (const key of ["ENF", "CON"] as const) {
    const info = PROGRAMS[key];
    const program = must(`programa ${info.name}`, await createProgram(admin, { name: info.name, description: info.description, isPublished: true }));
    must("cursos del programa", await addProgramCourses(admin, program.programId, built.filter((course) => course.data.program === key).map((course) => course.id)));
    const group = must(`grupo ${key}`, await createGroup(admin, {
      name: info.groupName(year),
      description: info.groupDescription,
      programId: program.programId,
      startsOn: current.start,
      endsOn: current.end,
      capacity: "30",
    }));
    must("miembros del grupo", await addGroupMembers(admin, group.groupId, STUDENTS.filter((student) => student.track === key).map((student) => userId(student.email))));
    must("cursos del grupo", await addProgramCoursesToGroup(admin, group.groupId));
    must("inscribir grupo", await enrollGroupInCourses(admin, group.groupId));
  }
  const excel = courseByCode("EXC-100");
  must("inscribir Excel", await enrollStudents(excel.teacher, excel.id, STUDENTS.filter((student) => student.track === "EXCEL" || student.alsoExcel).map((student) => userId(student.email))));
  // Las matrículas cuentan desde el inicio del período, como si el cuatrimestre llevara siete semanas.
  await db.enrollment.updateMany({ where: { institutionId }, data: { enrolledAt: new Date(`${current.start}T12:00:00.000Z`) } });

  const studentByUserId = new Map(STUDENTS.map((student) => [userId(student.email), student]));
  const rosterOf = async (courseId: string) => {
    const enrollments = await db.enrollment.findMany({ where: { courseId, institutionId, status: "ACTIVE" }, select: { id: true, studentId: true }, orderBy: { studentId: "asc" } });
    return enrollments.map((enrollment) => ({ ...enrollment, student: studentByUserId.get(enrollment.studentId)! }));
  };
  const rosters = new Map<string, Awaited<ReturnType<typeof rosterOf>>>();
  for (const course of built) rosters.set(course.id, await rosterOf(course.id));
  const studentActor = (id: string): Actor => ({ id, institutionId, role: "STUDENT" });
  const certificateStudents = [demoEmail("ana.reyes"), demoEmail("altagracia.henriquez")].map(userId);

  // --- Avance de lecciones -------------------------------------------------------------------------
  log("Cargando el avance de las lecciones…");
  for (const course of built) {
    const total = course.lessons.length;
    const rows: Array<{ institutionId: string; enrollmentId: string; lessonId: string; completed: boolean; watchedSeconds: number; completedAt: Date }> = [];
    const updates = [];
    for (const { id: enrollmentId, studentId, student } of rosters.get(course.id)!) {
      const next = random(`avance:${course.data.code}:${student.email}`);
      const [low, high] = PROFILE[student.profile].progress;
      const done = course.id === excel.id && certificateStudents.includes(studentId) ? total : Math.round(total * (low + next() * (high - low)));
      for (let index = 0; index < done; index += 1) {
        const lesson = course.lessons[index];
        rows.push({
          institutionId,
          enrollmentId,
          lessonId: lesson.id,
          completed: true,
          watchedSeconds: lesson.minutes * 60,
          completedAt: new Date(now.getTime() - Math.round((45 - (40 * (index + 1)) / done) * DAY_MS)),
        });
      }
      updates.push(db.enrollment.update({ where: { id: enrollmentId }, data: { progressPercent: progressPercentage(done, total) } }));
    }
    await db.$transaction([db.lessonProgress.createMany({ data: rows }), ...updates]);
  }

  // --- Asistencia de las últimas 6 semanas ---------------------------------------------------------
  log("Tomando asistencia de las últimas seis semanas…");
  await eachLimit(built, concurrency, async (course) => {
    const weekday = course.data.schedule[0].weekday;
    let last = dayKey(-1);
    while (weekdayOf(last) !== weekday) last = addDaysToDateKey(last, -1)!;
    const roster = rosters.get(course.id)!;
    for (let week = 0; week < 6; week += 1) {
      const date = addDaysToDateKey(last, -7 * (5 - week))!;
      const entries: AttendanceEntry[] = roster.map(({ studentId, student }) => {
        const next = random(`asistencia:${course.data.code}:${date}:${student.email}`);
        const { present, late } = PROFILE[student.profile];
        const roll = next();
        if (roll < present) return { studentId, status: "PRESENT" };
        if (roll < present + late) return { studentId, status: "LATE", note: "Llegó 15 minutos tarde." };
        return next() < 0.7 ? { studentId, status: "ABSENT", note: pick(next, ABSENCE_NOTES) } : { studentId, status: "EXCUSED", note: "Presentó excusa médica." };
      });
      must(`asistencia ${course.data.code} ${date}`, await saveAttendance(course.teacher, course.id, { date, title: course.lessons[week]?.title, entries }, now));
    }
  });

  // --- Tareas, entregas y notas --------------------------------------------------------------------
  log("Creando tareas, entregas y notas…");
  await eachLimit(built, concurrency, async (course) => {
    const manager = { ...course.teacher, capabilities: teacherCapabilities };
    const [first, second] = course.data.assignments;
    const pastTask = must("tarea 1", await saveAssignment(manager, {
      courseId: course.id,
      title: first.title,
      instructions: first.instructions,
      dueLocal: `${dayKey(-12)}T23:59`,
      maxScore: first.maxScore,
      allowLate: true,
      categoryId: course.categories.tasks,
      publish: true,
    }, at(-30, "08:00")));
    const nextTask = must("tarea 2", await saveAssignment(manager, {
      courseId: course.id,
      title: second.title,
      instructions: second.instructions,
      dueLocal: `${dayKey(6)}T23:59`,
      maxScore: second.maxScore,
      allowLate: false,
      categoryId: course.categories.tasks,
      publish: true,
    }, at(-5, "08:00")));

    for (const { studentId, student } of rosters.get(course.id)!) {
      const next = random(`tareas:${course.data.code}:${student.email}`);
      const profile = PROFILE[student.profile].firstTask;
      if (next() < profile.submit) {
        const late = next() < profile.late;
        const submittedAt = at(late ? -between(next, 8, 11) : -between(next, 13, 16), clock(next, 8, 22));
        must("entrega 1", await submitAssignment(studentActor(studentId), { assignmentId: pastTask.assignmentId, content: pick(next, first.answers) }, submittedAt));
        if (next() < 0.88) {
          const submission = await db.submission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: pastTask.assignmentId, studentId } }, select: { id: true } });
          const [low, high] = profile.score;
          const score = Math.min(first.maxScore, between(next, low, high) - (late ? 5 : 0));
          must("nota 1", await gradeSubmission(manager, { submissionId: submission.id, score, feedback: feedbackFor(next, (score / first.maxScore) * 100) }, at(-between(next, 4, 6), clock(next, 19, 22))));
        }
      }
      if (next() < PROFILE[student.profile].secondTask) {
        must("entrega 2", await submitAssignment(studentActor(studentId), { assignmentId: nextTask.assignmentId, content: pick(next, second.answers) }, at(-between(next, 1, 3), clock(next, 8, 22))));
      }
    }
  });

  // --- Exámenes e intentos -------------------------------------------------------------------------
  log("Creando exámenes y los intentos de los estudiantes…");
  await eachLimit(built, concurrency, async (course) => {
    const bank = new Map<string, DemoQuestion>();
    const questions: Array<{ bankItemId: string; points: number }> = [];
    for (const question of course.data.exam.questions) {
      const points = question.type === "MULTIPLE_CHOICE" ? 15 : 12.5;
      const input = question.type === "MULTIPLE_CHOICE"
        ? { type: question.type, prompt: question.prompt, options: question.options, correctIndex: question.correctIndex, explanation: question.explanation, points }
        : { type: question.type, prompt: question.prompt, answer: question.answer, explanation: question.explanation, points };
      const created = must(`pregunta ${question.prompt}`, await createQuestion(course.teacher, course.id, input));
      bank.set(created.id, question);
      questions.push({ bankItemId: created.id, points });
    }
    const exam = must("examen", await createExam(course.teacher, course.id, {
      title: course.data.exam.title,
      instructions: course.data.exam.instructions,
      questions,
      durationMinutes: 30,
      maxAttempts: 2,
      opensAt: `${dayKey(-10)}T07:00`,
      closesAt: `${dayKey(4)}T23:00`,
      showReview: true,
      gradeCategoryId: course.categories.exams,
    }));
    must("publicar examen", await setExamPublished(course.teacher, exam.id, true));

    const answer = (next: () => number, correct: number) => {
      const responses: Record<string, string> = {};
      for (const [bankItemId, question] of bank) {
        const right = next() < correct;
        if (question.type === "TRUE_FALSE") responses[bankItemId] = right ? question.answer : question.answer === "Verdadero" ? "Falso" : "Verdadero";
        else responses[bankItemId] = right ? question.options[question.correctIndex] : pick(next, question.options.filter((_, index) => index !== question.correctIndex));
      }
      return responses;
    };
    for (const { studentId, student } of rosters.get(course.id)!) {
      const next = random(`examen:${course.data.code}:${student.email}`);
      const profile = PROFILE[student.profile].exam;
      if (next() >= profile.take) continue;
      const firstDay = between(next, 2, 9);
      const days = [firstDay, ...(next() < profile.retry ? [between(next, 1, firstDay - 1)] : [])];
      for (const [attempt, day] of days.entries()) {
        const startsAt = at(-day, clock(next, 8, 21));
        const started = must("iniciar examen", await startExamAttempt(studentActor(studentId), exam.id, startsAt));
        const correct = Math.min(0.98, profile.correct + attempt * 0.12);
        must("enviar examen", await submitExamAttempt(studentActor(studentId), started.attemptId, answer(next, correct), new Date(startsAt.getTime() + between(next, 12, 26) * 60_000)));
      }
    }
  });

  // --- Clases en vivo próximas ---------------------------------------------------------------------
  log("Programando clases en vivo…");
  for (const course of built) {
    const live = course.data.liveClass;
    must(`clase en vivo ${course.data.code}`, await createLiveClasses(course.teacher, {
      courseId: course.id,
      title: live.title,
      description: live.description,
      date: dayKey(live.daysFromToday),
      time: live.time,
      durationMinutes: live.durationMinutes,
      joinUrl: `https://meet.jit.si/EdukanaDemo-${course.data.code}`,
      weeks: live.weeks,
    }, now));
  }

  // --- Avisos --------------------------------------------------------------------------------------
  log("Publicando avisos…");
  const nursing = built.filter((course) => course.data.teacher === "rosa").map((course) => course.id);
  const accounting = built.filter((course) => course.data.program === "CON").map((course) => course.id);
  const announcements = [
    {
      authorId: adminId,
      title: `¡Bienvenidos al ${periodName(current.start, current.end)}!`,
      content: "Les damos la bienvenida a este nuevo cuatrimestre. Revisen su horario en la sección Calendario y entren a sus cursos para ver las lecciones de la primera unidad. Cualquier duda, la coordinación está disponible de lunes a viernes de 8:00 a. m. a 8:00 p. m.",
      institution: true,
      pinned: true,
      daysAgo: 45,
      roles: [] as EdukanaRole[],
      courses: [] as string[],
    },
    {
      authorId: userId(TEACHERS.rosa.email),
      title: "Práctica de signos vitales en el laboratorio",
      content: "El próximo martes haremos la práctica de toma de signos vitales en el Laboratorio de Enfermería. Vengan con uniforme completo, reloj con segundero y su libreta de registro. La asistencia cuenta para la nota de la unidad.",
      institution: false,
      pinned: false,
      daysAgo: 3,
      roles: [],
      courses: nursing,
    },
    {
      authorId: coordinator.id,
      title: "Charla sobre facturación electrónica",
      content: "Los estudiantes de Contabilidad están invitados a la charla sobre facturación electrónica y comprobantes fiscales. Será en el Aula 205, de 6:00 a 7:30 p. m. Traigan sus preguntas sobre el cierre fiscal de fin de año.",
      institution: false,
      pinned: false,
      daysAgo: 5,
      roles: [],
      courses: accounting,
    },
    {
      authorId: adminId,
      title: `Recordatorio: mensualidad de ${monthOf(dayKey(5))}`,
      content: `La mensualidad de ${monthOf(dayKey(5))} vence el ${Number(dayKey(5).slice(8, 10))} de ${monthOf(dayKey(5))}. Pueden pagar en caja, por transferencia o con tarjeta. Si tienen algún inconveniente, pasen por administración para acordar un plan de pago.`,
      institution: false,
      pinned: false,
      daysAgo: 2,
      roles: ["STUDENT", "PARENT"] as EdukanaRole[],
      courses: [],
    },
  ];
  for (const item of announcements) {
    await db.$transaction(async (tx) => {
      const legacy = item.institution
        ? { audience: "ALL" as const, audienceId: null }
        : item.courses.length === 1 && !item.roles.length
          ? { audience: "COURSE" as const, audienceId: item.courses[0] }
          : { audience: "ROLE" as const, audienceId: item.roles.length === 1 && !item.courses.length ? item.roles[0] : null };
      const publishedAt = new Date(now.getTime() - item.daysAgo * DAY_MS);
      const announcement = await tx.announcement.create({
        data: {
          institutionId,
          authorId: item.authorId,
          title: item.title,
          content: item.content,
          audienceInstitution: item.institution,
          ...legacy,
          isPinned: item.pinned,
          publishedAt,
          createdAt: publishedAt,
          roleTargets: { create: item.roles.map((role) => ({ institutionId, role })) },
          courseTargets: { create: item.courses.map((courseId) => ({ institutionId, courseId })) },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { institutionId, userId: item.authorId, action: "announcement.publish", entity: "Announcement", entityId: announcement.id, changes: { audienceInstitution: item.institution, roles: item.roles, courses: item.courses, source: "demo-seed" } },
      });
    });
  }

  // --- Tutores vinculados --------------------------------------------------------------------------
  await db.guardianship.createMany({
    data: GUARDIANS.map((guardian) => ({
      institutionId,
      parentId: userId(guardian.email),
      studentId: userId(guardian.studentEmail),
      relationship: guardian.relationship,
      status: "ACTIVE" as const,
      canViewAcademics: true,
      canViewAttendance: true,
      canViewSchedule: true,
      canViewAnnouncements: true,
      canViewFinance: true,
      createdById: adminId,
      updatedById: adminId,
    })),
  });

  // --- Cobros: mensualidad pasada, mensualidad actual y el curso de Excel ---------------------------
  log("Creando cobros y pagos…");
  const groups = await db.studentGroup.findMany({ where: { institutionId }, select: { id: true, program: { select: { name: true } } } });
  const dues = [
    // 33 días de diferencia: las dos mensualidades siempre caen en meses distintos.
    { key: "pasada" as const, due: dayKey(-28) },
    { key: "actual" as const, due: dayKey(5) },
  ];
  const methods = ["TRANSFER", "CASH", "CARD", "TRANSFER"] as const;
  const payments: Array<{ chargeId: string; amountCents: number; paidOn: string; method: string; note: string }> = [];
  const payNote = (method: string, next: () => number) =>
    method === "TRANSFER" ? `Transferencia ${pick(next, ["Banreservas", "Banco Popular", "BHD"])}, ref. ${between(next, 10000, 99999)}` : method === "CARD" ? "Pago con tarjeta en caja." : "Pago en efectivo en caja.";

  for (const program of ["ENF", "CON"] as const) {
    const info = PROGRAMS[program];
    const group = groups.find((row) => row.program?.name === info.name)!;
    for (const { key, due } of dues) {
      const concept = `Mensualidad de ${monthOf(due)} · ${info.name}`;
      must(`cargos ${concept}`, await createGroupCharges(admin, {
        concept,
        amountCents: info.monthlyFeeCents,
        dueDate: due,
        periodId: currentPeriod.periodId,
        target: { kind: "group", id: group.id },
        operationKey: `demo-${randomUUID()}`,
      }));
      const charges = await db.paymentConcept.findMany({ where: { institutionId, concept }, select: { id: true, studentId: true } });
      for (const charge of charges) {
        const student = studentByUserId.get(charge.studentId ?? "");
        if (!student) continue;
        const next = random(`pago:${concept}:${student.email}`);
        const method = pick(next, methods);
        const full = info.monthlyFeeCents;
        let amountCents = 0;
        let paidOffset = 0;
        if (key === "pasada") {
          if (student.profile === "destacado" || student.profile === "regular") amountCents = full;
          else if (student.profile === "atrasado") amountCents = full / 2;
          paidOffset = -28 + between(next, -4, 3);
        } else {
          if (student.profile === "destacado") amountCents = full;
          else if (student.profile === "regular" && next() < 0.4) amountCents = full / 2;
          paidOffset = -between(next, 1, 4);
        }
        if (amountCents > 0) payments.push({ chargeId: charge.id, amountCents, paidOn: dayKey(paidOffset), method, note: payNote(method, next) });
      }
    }
  }
  for (const student of STUDENTS.filter((row) => row.track === "EXCEL")) {
    const next = random(`excel:${student.email}`);
    const charge = must("cargo Excel", await createCharge(admin, {
      studentId: userId(student.email),
      concept: "Curso Excel para la Oficina",
      amountCents: excel.data.catalogPriceCents ?? 250000,
      dueDate: dayKey(-20),
      periodId: currentPeriod.periodId,
    }));
    const amountCents = student.profile === "atrasado" ? 100000 : student.profile === "regular" && next() < 0.5 ? 125000 : student.profile === "destacado" ? 250000 : 0;
    const method = pick(next, methods);
    if (amountCents > 0 && charge.chargeId) payments.push({ chargeId: charge.chargeId, amountCents, paidOn: dayKey(-between(next, 18, 28)), method, note: payNote(method, next) });
  }
  await eachLimit(payments, concurrency, async (payment) => {
    must("pago", await recordPayment(admin, payment, now));
  });

  // --- Solicitudes de admisión ---------------------------------------------------------------------
  log("Registrando solicitudes de admisión…");
  for (const lead of LEADS) {
    const created = must(`solicitud ${lead.email}`, await createLead(admin, {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      programInterest: lead.programInterest,
      source: lead.source,
      notes: lead.notes,
    }));
    if (lead.stage !== "INTERESTED") must("etapa", await moveLeadStage(admin, created.leadId, lead.stage, "reason" in lead ? lead.reason : ""));
  }

  // --- Catálogo público ----------------------------------------------------------------------------
  for (const course of built.filter((row) => row.data.catalogPriceCents)) {
    await db.course.updateMany({ where: { id: course.id, institutionId }, data: { isPublic: true, priceCents: course.data.catalogPriceCents, currency: "DOP" } });
  }

  // --- Un retiro y dos certificados (al final: cambian el estado de la matrícula) ------------------
  const math = courseByCode("CON-102");
  const leaving = rosters.get(math.id)!.find(({ student }) => student.email === demoEmail("angel.morillo"));
  if (leaving) {
    must("retiro", await withdrawStudent(admin, math.id, leaving.id, "Cambió de horario en su trabajo y pidió retirarse de esta materia. Puede retomarla el próximo cuatrimestre.", at(-2, "18:30")));
  }

  log("Emitiendo certificados…");
  const certificateSecret = process.env.CERTIFICATE_SECRET ?? process.env.AUTH_SECRET ?? "";
  for (const studentId of certificateStudents) {
    const enrollment = rosters.get(excel.id)!.find((row) => row.studentId === studentId);
    if (!enrollment) continue;
    must("curso completado", await markCourseCompleted(excel.teacher, excel.id, enrollment.id, at(-3, "12:00")));
    if (!certificateSecret) continue;
    must("certificado", await issueCertificate(excel.teacher, excel.id, enrollment.id, at(-2, "10:00")));
  }
  if (!certificateSecret) {
    warnings.push("No se emitieron los certificados porque falta CERTIFICATE_SECRET (o AUTH_SECRET). Los dos estudiantes quedaron con el curso completado; emítelos desde la pantalla de certificados.");
  }
  return warnings;
}

/** Perfil de un estudiante de la demostración, por correo (lo usa la prueba). */
export function demoStudent(email: string): DemoStudent | undefined {
  return STUDENTS.find((student) => student.email === email);
}

// ---------------------------------------------------------------------------------------
// Quitar
// ---------------------------------------------------------------------------------------

export type RemoveDemoResult = { removed: boolean; identitiesRemoved: number };

/** Borra la institución de demostración, si existe, y las cuentas que solo eran suyas. */
export async function removeDemo(): Promise<RemoveDemoResult> {
  const institution = await findDemoInstitution();
  if (!institution) {
    const identitiesRemoved = await removeOrphanDemoIdentities();
    return { removed: false, identitiesRemoved };
  }
  return removeDemoInstitution(institution.id);
}

function removeOrphanDemoIdentities() {
  return db.identity
    .deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, users: { none: {} } } })
    .then((result) => result.count);
}

/**
 * Borra todo lo de la institución `institutionId` en una transacción y en el orden que exigen las
 * claves foráneas (varias relaciones no se borran en cascada a propósito). Solo filtra por esa
 * institución: si algo de otra institución apuntara a ella, la transacción falla y no se borra nada.
 */
async function removeDemoInstitution(institutionId: string): Promise<RemoveDemoResult> {
  return db.$transaction(async (tx) => {
    const institution = await tx.institution.findUnique({ where: { id: institutionId }, select: { slug: true } });
    if (!institution) return { removed: false, identitiesRemoved: 0 };
    if (institution.slug !== DEMO_SLUG) throw new Error("Demo: esa institución no es la de demostración. No se borró nada.");
    const scope = { institutionId };
    const ofCourses = { course: { institutionId } };

    await tx.examAnswer.deleteMany({ where: { attempt: { institutionId } } });
    await tx.examAttempt.deleteMany({ where: scope });
    await tx.examQuestion.deleteMany({ where: { exam: { institutionId } } });
    await tx.gradeEntryRevision.deleteMany({ where: scope });
    await tx.gradeEntry.deleteMany({ where: scope });
    await tx.gradeItem.deleteMany({ where: scope });
    await tx.gradeCategory.deleteMany({ where: scope });
    await tx.gradingPeriod.deleteMany({ where: scope });
    await tx.submissionRevision.deleteMany({ where: scope });
    await tx.storageAsset.deleteMany({ where: scope });
    await tx.submission.deleteMany({ where: { assignment: ofCourses } });
    await tx.certificate.deleteMany({ where: scope });
    await tx.attendance.deleteMany({ where: scope });
    await tx.attendanceSession.deleteMany({ where: scope });
    await tx.lessonProgress.deleteMany({ where: scope });
    await tx.enrollment.deleteMany({ where: ofCourses });
    await tx.exam.deleteMany({ where: scope });
    await tx.questionBankItem.deleteMany({ where: scope });
    await tx.liveClass.deleteMany({ where: scope });
    await tx.scheduleSlot.deleteMany({ where: scope });
    await tx.payment.deleteMany({ where: scope });
    await tx.paymentConcept.deleteMany({ where: scope });
    await tx.announcement.deleteMany({ where: scope });
    await tx.guardianship.deleteMany({ where: scope });
    await tx.roleCapabilityOverride.deleteMany({ where: scope });
    await tx.courseOrder.deleteMany({ where: scope });
    await tx.courseReview.deleteMany({ where: scope });
    await tx.course.deleteMany({ where: scope });
    await tx.academicPeriod.deleteMany({ where: scope });
    await tx.auditLog.deleteMany({ where: scope });
    await tx.institution.delete({ where: { id: institutionId } });
    const identities = await tx.identity.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, users: { none: {} } } });
    return { removed: true, identitiesRemoved: identities.count };
  }, { timeout: 180_000, maxWait: 20_000 });
}
