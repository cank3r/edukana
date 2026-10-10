/**
 * Institución de demostración «Instituto Técnico Demo».
 *
 * `createDemo` crea UNA institución nueva (siempre con el mismo identificador) que parece un instituto
 * técnico dominicano con ocho semanas de clases: 120 estudiantes, 10 docentes, 2 programas con 4 grupos,
 * 12 cursos con contenido, asistencia dos veces por semana, tareas semanales con entregas y notas,
 * exámenes con intentos (algunos con respuestas abiertas por revisar), cobros, admisiones, avisos,
 * notificaciones, horario, clases en vivo, catálogo con pedidos y reseñas, y certificados.
 *
 * Para que cargue en menos de un minuto contra Supabase, todo se arma primero en memoria y se escribe
 * por lotes (`createMany`) con los mismos campos que dejan las funciones de `src/server/**` (estados,
 * columnas del libro de calificaciones, copia de cada pregunta en el examen, saldos de los cobros).
 * Solo los dos períodos pasan por su función (`createPeriod`), que decide cuál es el actual.
 * Ningún paso envía correos.
 *
 * Todas las fechas se calculan desde «ahora» (`options.now`) y los repartos salen de un azar con semilla
 * fija: dos cargas el mismo día dan los mismos datos.
 *
 * `removeDemo` borra SOLO esa institución y las cuentas `@demo.edukana.do` que no pertenezcan a
 * ninguna otra institución, en una sola transacción. Nunca toca otras instituciones.
 *
 * Este archivo no se ejecuta solo: lo usan `seed-demo.ts` (la línea de comandos) y la prueba
 * `tests/integration/demo-seed.test.ts`.
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { normalizeLessonVideo } from "@/lib/lesson-video";
import { autoScoreAnswer, createCertificateIdentity, progressPercentage } from "@/lib/lms";
import { addDaysToDateKey, zonedDateKey, zonedTimeToUtc } from "@/lib/timezone";
import { createPeriod } from "@/server/academic/periods";
import { questionSnapshot } from "@/server/exams";
import { ensureIdentity } from "@/server/identity";
import { DEFAULT_PLATFORM_PLANS, seedPlatformPlans } from "@/server/platform/plan-defaults";
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
  type DemoStudent,
  type StudentProfile,
} from "./content";

export { DEMO_EMAIL_DOMAIN };
export const DEMO_SLUG = "instituto-tecnico-demo";
export const DEMO_NAME = "Instituto Técnico Demo";
const TIME_ZONE = "America/Santo_Domingo";
const DAY_MS = 24 * 60 * 60 * 1000;
/** El cuatrimestre empezó hace 8 semanas y 2 días: hay 8 semanas completas de clases. */
const PERIOD_START = -58;
const WEEKS = 8;

type Actor = { id: string; institutionId: string; role: EdukanaRole };
type Log = (message: string) => void;

export type DemoAccount = { role: string; name: string; email: string };
/** Cuántas filas se crearon de cada cosa, para el informe del comando. */
export type DemoCounts = Record<string, number>;
export type CreateDemoResult =
  | { created: false; institutionId: string }
  | { created: true; institutionId: string; accounts: DemoAccount[]; warnings: string[]; counts: DemoCounts };

export type CreateDemoOptions = {
  /** Contraseña de todas las cuentas de demostración. */
  password: string;
  /** «Hoy» para las fechas relativas. Por defecto, ahora. */
  now?: Date;
  /** Se conserva por compatibilidad; las escrituras van por lotes. */
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

/** Azar reproducible: la misma semilla da siempre la misma secuencia. */
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
type Rand = () => number;
const between = (next: Rand, min: number, max: number) => min + Math.floor(next() * (max - min + 1));
const uniform = (next: Rand, min: number, max: number) => min + next() * (max - min);
const pick = <T>(next: Rand, items: readonly T[]): T => items[Math.floor(next() * items.length)];

/** Identificadores con la forma de `cuid()` (letra c + 24 caracteres en minúscula). */
let idCounter = 0;
function newId() {
  idCounter = (idCounter + 1) % 1_679_616;
  return `c${Date.now().toString(36).padStart(8, "0")}${idCounter.toString(36).padStart(4, "0")}${randomBytes(6).toString("hex")}`.slice(0, 25);
}

/** Escribe `rows` en lotes de `size` filas. */
async function inBatches<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>, size = 1000) {
  for (let start = 0; start < rows.length; start += size) await write(rows.slice(start, start + size));
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthOf = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
const demoEmail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const dbDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
/** Como `dateKeyToStored` de cobros: el mediodía UTC del día. */
const storedDay = (key: string) => new Date(`${key}T12:00:00.000Z`);

/** Día de la semana de una fecha AAAA-MM-DD: 1 = lunes … 7 = domingo. */
function weekdayOf(key: string) {
  const day = new Date(`${key}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Cómo le va a cada perfil. */
const PROFILE: Record<StudentProfile, {
  /** Parte de las lecciones publicadas que ya completó. */
  progress: [number, number];
  /** Asistencia (presente o tarde) entre clases tomadas. */
  attendance: [number, number];
  /** De lo que asiste, cuánto llega tarde. */
  late: number;
  /** Tareas vencidas que no entregó y entregas fuera de plazo. */
  missing: number;
  lateTask: number;
  score: [number, number];
  /** Entrega antes de tiempo la tarea que todavía no vence. */
  early: number;
  exam: { take: number; correct: number; retry: number; sample: [number, number, number] };
}> = {
  destacado: { progress: [0.85, 1], attendance: [0.92, 0.98], late: 0.03, missing: 0, lateTask: 0.02, score: [88, 100], early: 0.7, exam: { take: 1, correct: 0.92, retry: 0.05, sample: [0.85, 0.15, 0] } },
  regular: { progress: [0.55, 0.85], attendance: [0.84, 0.92], late: 0.07, missing: 0, lateTask: 0.08, score: [72, 92], early: 0.3, exam: { take: 0.96, correct: 0.76, retry: 0.25, sample: [0.45, 0.5, 0.05] } },
  atrasado: { progress: [0.32, 0.5], attendance: [0.82, 0.88], late: 0.12, missing: 0, lateTask: 0.35, score: [62, 80], early: 0, exam: { take: 0.85, correct: 0.62, retry: 0.2, sample: [0.1, 0.7, 0.2] } },
  en_riesgo: { progress: [0.05, 0.25], attendance: [0.62, 0.73], late: 0.15, missing: 0.35, lateTask: 0.5, score: [45, 68], early: 0, exam: { take: 0.6, correct: 0.42, retry: 0.5, sample: [0, 0.5, 0.5] } },
};

const ABSENCE_NOTES = ["Avisó por WhatsApp que estaba enferma.", "Cita médica.", "Problema con el transporte.", "No avisó.", "Turno extra en el trabajo.", "Se fue la luz en su sector y no pudo llegar."];
const FEEDBACK: Array<[number, string[]]> = [
  [90, ["Excelente trabajo, muy completo y bien explicado.", "Muy bien. Se nota que repasaste las lecciones.", "Trabajo claro y ordenado. ¡Sigue así!"]],
  [75, ["Buen trabajo. Te faltó desarrollar un poco más el último punto.", "Bien hecho; revisa la presentación.", "Correcto en general. Agrega ejemplos propios la próxima vez."]],
  [60, ["Vas por buen camino, pero faltan partes de la consigna. Pasa por consulta.", "Revisa las lecciones de la unidad y corrige los errores marcados.", "Incompleto. Lee otra vez las instrucciones antes de entregar."]],
  [0, ["Faltan la mayoría de los puntos pedidos. Hablemos en la próxima clase.", "Necesitas reforzar este tema. Te recomiendo la tutoría del sábado."]],
];
const feedbackFor = (next: Rand, percent: number) => pick(next, FEEDBACK.find(([min]) => percent >= min)?.[1] ?? FEEDBACK[FEEDBACK.length - 1][1]);
const SHORT_FEEDBACK = ["Muy buena explicación, completa y con tus palabras.", "Vas bien, pero te faltó explicar el porqué.", "La respuesta no corresponde a lo visto en clase. Repasa la unidad."];
const WEEKLY_ANSWERS = [
  (topic: string) => `Resumen de «${topic}»: anoté las ideas principales, puse un ejemplo de mi trabajo y una pregunta para la próxima clase.`,
  (topic: string) => `Sobre «${topic}»: lo más importante es aplicar el paso a paso. Mi ejemplo es del negocio de mi familia. Me quedó la duda de cuándo usar cada caso.`,
  (topic: string) => `Hice la práctica de «${topic}». Adjunto mis respuestas a las tres preguntas.`,
];

// ---------------------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------------------

/** Plan de la demostración: sus 120 estudiantes caben sin que aparezca el aviso de límite del plan. */
const DEMO_PLAN = "PRO" as const;

/**
 * Suscripción activa de la demostración (un mes desde `now`). Idempotente: si ya tiene una, no la cambia
 * (el operador pudo haberla editado).
 */
async function ensureDemoSubscription(tx: Prisma.TransactionClient, institutionId: string, now: Date) {
  const existing = await tx.institutionSubscription.findUnique({ where: { institutionId }, select: { id: true } });
  if (existing) return;
  await seedPlatformPlans(tx);
  const plan = DEFAULT_PLATFORM_PLANS.find((row) => row.code === DEMO_PLAN)!;
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + 1);
  await tx.institutionSubscription.create({
    data: { institutionId, planCode: DEMO_PLAN, status: "ACTIVE", priceCents: plan.priceCents, currentPeriodStart: now, currentPeriodEnd: end, notes: "Institución de demostración" },
  });
}

/**
 * Crea la institución de demostración. Si ya existe, no crea nada y devuelve `created: false`.
 * Si algo falla a mitad de camino, borra lo que alcanzó a crear y vuelve a lanzar el error.
 */
export async function createDemo(options: CreateDemoOptions): Promise<CreateDemoResult> {
  const log: Log = options.log ?? (() => undefined);
  const existing = await findDemoInstitution();
  if (existing) {
    // Una demostración cargada antes del backoffice no tenía suscripción: se le agrega sin tocar nada más.
    await db.$transaction((tx) => ensureDemoSubscription(tx, existing.id, options.now ?? new Date()));
    return { created: false, institutionId: existing.id };
  }

  const now = options.now ?? new Date();
  const passwordHash = await bcrypt.hash(options.password, 10);

  // La institución y su directora nacen juntas, como cuando la crea el operador de la plataforma.
  const created = await db.$transaction(async (tx) => {
    const institution = await tx.institution.create({
      data: { name: DEMO_NAME, slug: DEMO_SLUG, type: "INSTITUTE", timezone: TIME_ZONE, language: "es", brandColor: "#0E7490", status: "ACTIVE", plan: DEMO_PLAN },
      select: { id: true },
    });
    await ensureDemoSubscription(tx, institution.id, now);
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
    const { warnings, counts } = await fill(created.institutionId, created.adminId, passwordHash, now, log);
    const accounts: DemoAccount[] = [
      { role: "Dirección (administración)", name: ADMIN.name, email: ADMIN.email },
      { role: "Coordinación", name: COORDINATOR.name, email: COORDINATOR.email },
      { role: "Docente de Enfermería", name: TEACHERS.rosa.name, email: TEACHERS.rosa.email },
      { role: "Docente de Contabilidad", name: TEACHERS.ramon.name, email: TEACHERS.ramon.email },
      { role: "Docente de Mercadeo", name: TEACHERS.lissette.name, email: TEACHERS.lissette.email },
      { role: "Estudiante destacada", name: "Ana Mercedes Reyes", email: demoEmail("ana.reyes") },
      { role: "Estudiante en riesgo", name: "Yaritza Mejía Lora", email: demoEmail("yaritza.mejia") },
      { role: "Tutora", name: GUARDIANS[0].name, email: GUARDIANS[0].email },
    ];
    return { created: true, institutionId: created.institutionId, accounts, warnings, counts };
  } catch (error) {
    log("Algo falló. Se borra lo que se alcanzó a crear de la demostración…");
    await removeDemoInstitution(created.institutionId);
    throw error;
  }
}

type BuiltEnrollment = {
  id: string;
  studentId: string;
  student: DemoStudent;
  courseIndex: number;
  status: "ACTIVE" | "COMPLETED" | "DROPPED";
  progressPercent: number;
  completedAt: Date | null;
  withdrawnAt: Date | null;
  withdrawReason: string | null;
};

async function fill(institutionId: string, adminId: string, passwordHash: string, now: Date, log: Log): Promise<{ warnings: string[]; counts: DemoCounts }> {
  const warnings: string[] = [];
  const counts: DemoCounts = {};
  const count = (label: string, rows: number) => {
    counts[label] = (counts[label] ?? 0) + rows;
  };
  const dayKey = (offset: number) => zonedDateKey(new Date(now.getTime() + offset * DAY_MS), TIME_ZONE);
  const at = (key: string, time: string) => {
    const instant = zonedTimeToUtc(key, time, TIME_ZONE);
    if (!instant) throw new Error(`Demo: hora no válida ${key} ${time}`);
    return instant;
  };
  const atOffset = (offset: number, time: string) => at(dayKey(offset), time);
  const clock = (next: Rand, fromHour: number, toHour: number) => `${String(between(next, fromHour, toHour)).padStart(2, "0")}:${String(between(next, 0, 59)).padStart(2, "0")}`;
  /** Nunca en el futuro: lo que ya pasó queda al menos 20 minutos antes de «ahora». */
  const past = (date: Date, next: Rand) => (date.getTime() < now.getTime() - 20 * 60_000 ? date : new Date(now.getTime() - between(next, 30, 300) * 60_000));
  const year = Number(dayKey(0).slice(0, 4));
  const admin: Actor = { id: adminId, institutionId, role: "ADMIN" };
  // Mensualidades que vencen el día 15: la del mes que viene (o este, si aún no llega el 15) y las dos anteriores.
  const today = dayKey(0);
  const shiftMonth = (key: string, months: number) => {
    const total = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + months;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-15`;
  };
  const lastDue = Number(today.slice(8, 10)) < 15 ? `${today.slice(0, 7)}-15` : shiftMonth(today, 1);
  const monthDues = [shiftMonth(lastDue, -2), shiftMonth(lastDue, -1), lastDue];
  const offsetOf = (key: string) => Math.round((storedDay(key).getTime() - storedDay(today).getTime()) / DAY_MS);

  // --- Personas ------------------------------------------------------------------------------------
  log("Creando personas…");
  const people = [
    { ...COORDINATOR, role: "COORDINATOR" as const },
    ...Object.values(TEACHERS).map((teacher) => ({ ...teacher, role: "TEACHER" as const })),
    ...STUDENTS.map((student) => ({ ...student, role: "STUDENT" as const })),
    ...GUARDIANS.map((guardian) => ({ ...guardian, role: "PARENT" as const })),
  ];
  const emails = [ADMIN.email, ...people.map((person) => person.email)];
  if (new Set(emails).size !== emails.length) throw new Error("Demo: hay correos repetidos en las personas de la demostración.");
  const before = await db.identity.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
  const identityByEmail = new Map(before.map((identity) => [identity.email, identity.id]));
  const newIdentities = emails.filter((email) => !identityByEmail.has(email)).map((email) => ({ id: newId(), email, passwordHash, status: "ACTIVE" as const }));
  await inBatches(newIdentities, (data) => db.identity.createMany({ data }));
  for (const identity of newIdentities) identityByEmail.set(identity.email, identity.id);

  const userIdByEmail = new Map<string, string>([[ADMIN.email, adminId]]);
  const joined = new Date(now.getTime() + (PERIOD_START - 21) * DAY_MS);
  const users = people.map((person, index) => {
    const id = newId();
    userIdByEmail.set(person.email, id);
    return {
      id,
      identityId: identityByEmail.get(person.email)!,
      institutionId,
      name: person.name,
      email: person.email,
      phone: person.phone,
      role: person.role,
      status: "ACTIVE" as const,
      createdAt: new Date(joined.getTime() + index * 60_000),
    };
  });
  await inBatches(users, (data) => db.user.createMany({ data }));
  count("personas", users.length + 1);
  const userId = (email: string) => {
    const id = userIdByEmail.get(email);
    if (!id) throw new Error(`Demo: falta la persona ${email}`);
    return id;
  };

  // Misma contraseña para todas, salvo una identidad que ya existiera en otra institución.
  const identities = await db.identity.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, users: { select: { institutionId: true } } } });
  const own = identities.filter((identity) => identity.users.every((user) => user.institutionId === institutionId));
  await db.identity.updateMany({ where: { id: { in: own.map((identity) => identity.id) } }, data: { passwordHash, status: "ACTIVE" } });
  for (const identity of identities) {
    if (!own.includes(identity)) warnings.push(`La cuenta ${identity.email} ya existía en otra institución: se dejó con su contraseña de siempre.`);
  }

  // --- Períodos: el actual (empezó hace 8 semanas) y el anterior -----------------------------------
  log("Creando períodos…");
  const periodName = (start: string, end: string) =>
    start.slice(0, 4) === end.slice(0, 4)
      ? `Cuatrimestre ${capital(monthOf(start))}–${capital(monthOf(end))} ${start.slice(0, 4)}`
      : `Cuatrimestre ${capital(monthOf(start))} ${start.slice(0, 4)}–${capital(monthOf(end))} ${end.slice(0, 4)}`;
  const current = { start: dayKey(PERIOD_START), end: dayKey(PERIOD_START + 119) };
  const previous = { start: dayKey(PERIOD_START - 121), end: dayKey(PERIOD_START - 1) };
  const currentPeriod = await createPeriod(admin, { name: periodName(current.start, current.end), startDate: current.start, endDate: current.end });
  if (!currentPeriod.ok) throw new Error(`Demo: falló el período actual: ${currentPeriod.message}`);
  const previousPeriod = await createPeriod(admin, { name: periodName(previous.start, previous.end), startDate: previous.start, endDate: previous.end });
  if (!previousPeriod.ok) throw new Error(`Demo: falló el período anterior: ${previousPeriod.message}`);
  const periodId = currentPeriod.periodId;
  const period = await db.academicPeriod.findUniqueOrThrow({ where: { id: periodId }, select: { startDate: true, endDate: true } });
  count("períodos", 2);

  // --- Cursos, contenido, libro de calificaciones y horario -----------------------------------------
  log("Creando cursos, capítulos y lecciones…");
  type BuiltCourse = {
    data: DemoCourse;
    id: string;
    teacherId: string;
    lessons: Array<{ id: string; title: string; minutes: number; type: string }>;
    gradingPeriodId: string;
    categories: { tasks: string; exams: string };
  };
  const courseCreated = new Date(now.getTime() + (PERIOD_START - 14) * DAY_MS);
  const built: BuiltCourse[] = COURSES.map((data) => ({
    data,
    id: newId(),
    teacherId: userId(TEACHERS[data.teacher].email),
    lessons: [],
    gradingPeriodId: newId(),
    categories: { tasks: newId(), exams: newId() },
  }));
  const courseByCode = (code: string) => {
    const course = built.find((row) => row.data.code === code);
    if (!course) throw new Error(`Demo: falta el curso ${code}`);
    return course;
  };
  await db.course.createMany({
    data: built.map((course) => ({
      id: course.id,
      institutionId,
      periodId,
      teacherId: course.teacherId,
      name: course.data.name,
      code: course.data.code,
      description: course.data.description,
      maxStudents: course.data.code.startsWith("ENF") || course.data.code.startsWith("CON") ? 60 : course.data.maxStudents,
      isPublished: true,
      isPublic: Boolean(course.data.catalogPriceCents),
      priceCents: course.data.catalogPriceCents ?? null,
      currency: "DOP",
      createdAt: courseCreated,
    })),
  });
  count("cursos", built.length);

  const sections: Prisma.CourseSectionCreateManyInput[] = [];
  const lessons: Prisma.LessonCreateManyInput[] = [];
  for (const course of built) {
    course.data.chapters.forEach((chapter, chapterIndex) => {
      const sectionId = newId();
      sections.push({ id: sectionId, institutionId, courseId: course.id, title: chapter.title, description: chapter.description, order: chapterIndex, isPublished: true, createdAt: courseCreated });
      chapter.lessons.forEach((lesson, lessonIndex) => {
        const id = newId();
        const video = lesson.type === "VIDEO" ? normalizeLessonVideo(lesson.content) : null;
        if (lesson.type === "VIDEO" && !video) throw new Error(`Demo: el video de «${lesson.title}» no es un enlace válido.`);
        lessons.push({
          id,
          institutionId,
          courseId: course.id,
          sectionId,
          title: lesson.title,
          summary: lesson.summary,
          type: lesson.type,
          content: video ? null : lesson.content,
          videoUrl: video?.src ?? null,
          order: lessonIndex,
          estimatedMinutes: lesson.minutes,
          isPublished: !lesson.draft,
          createdAt: courseCreated,
        });
        if (!lesson.draft) course.lessons.push({ id, title: lesson.title, minutes: lesson.minutes, type: lesson.type });
      });
    });
  }
  await db.courseSection.createMany({ data: sections });
  await inBatches(lessons, (data) => db.lesson.createMany({ data }));
  count("capítulos", sections.length);
  count("lecciones", lessons.length);

  // Libro de calificaciones como lo deja «configuración simple»: tareas 40 % y exámenes 60 %.
  await db.gradingPeriod.createMany({
    data: built.map((course) => ({ id: course.gradingPeriodId, institutionId, courseId: course.id, academicPeriodId: periodId, name: "Notas del curso", startDate: period.startDate, endDate: period.endDate })),
  });
  await db.gradeCategory.createMany({
    data: built.flatMap((course) => [
      { id: course.categories.tasks, institutionId, courseId: course.id, gradingPeriodId: course.gradingPeriodId, name: "Tareas", weight: 40 },
      { id: course.categories.exams, institutionId, courseId: course.id, gradingPeriodId: course.gradingPeriodId, name: "Exámenes", weight: 60 },
    ]),
  });

  const slots = built.flatMap((course) =>
    course.data.schedule.map((slot) => ({
      institutionId,
      courseId: course.id,
      teacherId: course.teacherId,
      weekday: slot.weekday,
      startMinutes: slot.start,
      endMinutes: slot.end,
      classroom: slot.room,
      startsOn: dbDate(current.start),
      endsOn: dbDate(current.end),
    })),
  );
  await db.scheduleSlot.createMany({ data: slots });
  count("bloques de horario", slots.length);

  // --- Programas, grupos e inscripciones -----------------------------------------------------------
  log("Creando programas y grupos, e inscribiendo estudiantes…");
  const programs: Prisma.ProgramCreateManyInput[] = [];
  const programCourses: Prisma.ProgramCourseCreateManyInput[] = [];
  const groups: Prisma.StudentGroupCreateManyInput[] = [];
  const groupMembers: Prisma.StudentGroupMemberCreateManyInput[] = [];
  const groupCourses: Prisma.StudentGroupCourseCreateManyInput[] = [];
  const groupIdByKey = new Map<string, string>();
  for (const key of ["ENF", "CON"] as const) {
    const info = PROGRAMS[key];
    const programId = newId();
    const ownCourses = built.filter((course) => course.data.program === key);
    programs.push({ id: programId, institutionId, name: info.name, description: info.description, isPublished: true, createdAt: courseCreated });
    ownCourses.forEach((course, order) => programCourses.push({ institutionId, programId, courseId: course.id, order }));
    for (const group of info.groups) {
      const groupId = newId();
      groupIdByKey.set(group.key, groupId);
      const members = STUDENTS.filter((student) => student.group === group.key);
      groups.push({ id: groupId, institutionId, programId, name: group.name(year), description: group.description, startsOn: dbDate(current.start), endsOn: dbDate(current.end), capacity: 30, createdAt: courseCreated });
      for (const student of members) groupMembers.push({ institutionId, groupId, userId: userId(student.email), joinedAt: storedDay(current.start) });
      for (const course of ownCourses) groupCourses.push({ institutionId, groupId, courseId: course.id });
    }
  }
  await db.program.createMany({ data: programs });
  await db.programCourse.createMany({ data: programCourses });
  await db.studentGroup.createMany({ data: groups });
  await db.studentGroupMember.createMany({ data: groupMembers });
  await db.studentGroupCourse.createMany({ data: groupCourses });
  count("programas", programs.length);
  count("grupos", groups.length);

  const enrolledAt = storedDay(current.start);
  const enrollments: BuiltEnrollment[] = [];
  for (const student of STUDENTS) {
    const codes = [
      ...(student.group ? built.filter((course) => course.data.program === student.track).map((course) => course.data.code) : []),
      ...student.electives,
    ];
    for (const code of new Set(codes)) {
      const courseIndex = built.indexOf(courseByCode(code));
      enrollments.push({ id: newId(), studentId: userId(student.email), student, courseIndex, status: "ACTIVE", progressPercent: 0, completedAt: null, withdrawnAt: null, withdrawReason: null });
    }
  }
  const enrollmentsOf = (courseIndex: number) => enrollments.filter((row) => row.courseIndex === courseIndex);

  // Un retiro y quienes terminaron Excel (con certificado los tres primeros).
  const excelIndex = built.indexOf(courseByCode("EXC-100"));
  const finishers = ["altagracia.henriquez", "wendy.marte", "ana.reyes", "manuel.rosario"].map(demoEmail);
  const certified = finishers.slice(0, 3);
  for (const row of enrollmentsOf(excelIndex)) {
    if (finishers.includes(row.student.email)) {
      row.status = "COMPLETED";
      row.completedAt = atOffset(-3, "12:00");
    }
  }
  const withdrawn = enrollments.find((row) => row.courseIndex === built.indexOf(courseByCode("CON-102")) && row.student.email === demoEmail("angel.morillo"));
  if (withdrawn) {
    withdrawn.status = "DROPPED";
    withdrawn.withdrawnAt = atOffset(-2, "18:30");
    withdrawn.withdrawReason = "Cambió de horario en su trabajo y pidió retirarse de esta materia. Puede retomarla el próximo cuatrimestre.";
  }

  // --- Avance de lecciones -------------------------------------------------------------------------
  log("Calculando el avance de las lecciones…");
  const progressRows: Prisma.LessonProgressCreateManyInput[] = [];
  for (const enrollment of enrollments) {
    const course = built[enrollment.courseIndex];
    const total = course.lessons.length;
    const next = random(`avance:${course.data.code}:${enrollment.student.email}`);
    const [low, high] = PROFILE[enrollment.student.profile].progress;
    const done = enrollment.status === "COMPLETED" ? total : Math.round(total * uniform(next, low, high));
    for (let index = 0; index < done; index += 1) {
      const lesson = course.lessons[index];
      // Las lecciones se completan a lo largo del cuatrimestre; la última, hace pocos días.
      const daysAgo = Math.max(0.2, (-PERIOD_START - 3) * (1 - (index + 1) / Math.max(done, 1)) + uniform(next, 0.3, 4));
      const completedAt = past(new Date(now.getTime() - daysAgo * DAY_MS), next);
      progressRows.push({
        institutionId,
        enrollmentId: enrollment.id,
        lessonId: lesson.id,
        completed: true,
        watchedSeconds: lesson.minutes * 60,
        lastPositionSeconds: lesson.type === "VIDEO" ? lesson.minutes * 60 : 0,
        completedAt,
        updatedAt: completedAt,
      });
    }
    enrollment.progressPercent = progressPercentage(done, total);
  }

  await inBatches(
    enrollments.map((row) => ({
      id: row.id,
      institutionId,
      studentId: row.studentId,
      courseId: built[row.courseIndex].id,
      status: row.status,
      progressPercent: row.progressPercent,
      enrolledAt,
      completedAt: row.completedAt,
      withdrawnAt: row.withdrawnAt,
      withdrawReason: row.withdrawReason,
    })),
    (data) => db.enrollment.createMany({ data }),
  );
  count("inscripciones", enrollments.length);
  await inBatches(progressRows, (data) => db.lessonProgress.createMany({ data }), 2000);
  count("lecciones completadas", progressRows.length);

  // --- Asistencia: dos clases por semana en las últimas 8 semanas, con leve mejora -----------------
  log("Tomando asistencia de las últimas ocho semanas…");
  const attendanceRate = new Map(STUDENTS.map((student) => {
    const [low, high] = PROFILE[student.profile].attendance;
    return [student.email, uniform(random(`asistencia:${student.email}`), low, high)];
  }));
  const sessionRows: Prisma.AttendanceSessionCreateManyInput[] = [];
  const attendanceRows: Prisma.AttendanceCreateManyInput[] = [];
  const firstClassDay = dayKey(-WEEKS * 7);
  for (const [courseIndex, course] of built.entries()) {
    const weekdays = new Set(course.data.schedule.map((slot) => slot.weekday));
    const dates: string[] = [];
    for (let key = firstClassDay; key < dayKey(0); key = addDaysToDateKey(key, 1)!) if (weekdays.has(weekdayOf(key))) dates.push(key);
    const sessions = dates.map((date, index) => {
      const id = newId();
      const slot = course.data.schedule.find((row) => row.weekday === weekdayOf(date))!;
      const endTime = `${String(Math.floor(slot.end / 60)).padStart(2, "0")}:${String(slot.end % 60).padStart(2, "0")}`;
      sessionRows.push({
        id,
        institutionId,
        courseId: course.id,
        date: dbDate(date),
        title: course.lessons[Math.min(course.lessons.length - 1, Math.floor((index * course.lessons.length) / dates.length))]?.title ?? null,
        recordedById: course.teacherId,
        createdAt: at(date, endTime),
      });
      return { id, date, index, title: sessionRows.at(-1)!.title ?? null, recordedAt: at(date, endTime) };
    });
    for (const enrollment of enrollmentsOf(courseIndex)) {
      const next = random(`clases:${course.data.code}:${enrollment.student.email}`);
      const rate = attendanceRate.get(enrollment.student.email)!;
      const counted = sessions.filter((session) => !enrollment.withdrawnAt || at(session.date, "23:59") < enrollment.withdrawnAt);
      const absences = Math.round((1 - rate) * counted.length);
      // Más ausencias al principio: la asistencia mejora un poco semana a semana.
      const ranked = counted
        .map((session) => ({ session, key: next() * (1 + 0.8 * (1 - session.index / Math.max(1, sessions.length - 1))) }))
        .sort((a, b) => b.key - a.key);
      const absent = new Set(ranked.slice(0, absences).map((row) => row.session.id));
      for (const session of counted) {
        let status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" = "PRESENT";
        let notes: string | null = null;
        if (absent.has(session.id)) {
          if (next() < 0.12) {
            status = "EXCUSED";
            notes = "Presentó excusa médica.";
          } else {
            status = "ABSENT";
            notes = next() < 0.6 ? pick(next, ABSENCE_NOTES) : null;
          }
        } else if (next() < PROFILE[enrollment.student.profile].late) {
          status = "LATE";
          notes = "Llegó 15 minutos tarde.";
        }
        attendanceRows.push({
          institutionId,
          courseId: course.id,
          sessionId: session.id,
          enrollmentId: enrollment.id,
          date: dbDate(session.date),
          classSession: session.title,
          status,
          notes,
          recordedAt: session.recordedAt,
        });
      }
    }
  }
  await inBatches(sessionRows, (data) => db.attendanceSession.createMany({ data }));
  await inBatches(attendanceRows, (data) => db.attendance.createMany({ data }), 2000);
  count("clases con asistencia", sessionRows.length);
  count("registros de asistencia", attendanceRows.length);

  // --- Tareas semanales, entregas y notas ----------------------------------------------------------
  log("Creando tareas semanales, entregas y notas…");
  const assignmentRows: Prisma.AssignmentCreateManyInput[] = [];
  const gradeItemRows: Prisma.GradeItemCreateManyInput[] = [];
  const submissionRows: Prisma.SubmissionCreateManyInput[] = [];
  const gradeEntryRows: Prisma.GradeEntryCreateManyInput[] = [];
  type BuiltTask = { id: string; courseIndex: number; title: string; week: number; due: Date };
  const tasks: BuiltTask[] = [];
  for (const [courseIndex, course] of built.entries()) {
    const topics = course.lessons.filter((lesson) => lesson.type !== "VIDEO");
    for (let week = 1; week <= WEEKS + 1; week += 1) {
      const upcoming = week === WEEKS + 1;
      const handmade = week === 5 ? course.data.assignments[0] : upcoming ? course.data.assignments[1] : null;
      const topic = topics[Math.min(topics.length - 1, Math.floor(((week - 1) * topics.length) / WEEKS))]?.title ?? course.data.name;
      const title = handmade ? handmade.title : `Práctica semana ${week}: ${topic}`;
      const instructions = handmade
        ? handmade.instructions
        : `Repasa la lección «${topic}» y responde en tus palabras:\n\n1. ¿Cuál es la idea principal?\n2. Da un ejemplo de tu trabajo, tu casa o tu barrio.\n3. ¿Qué duda te quedó para la próxima clase?`;
      const dueKey = upcoming ? dayKey(5) : dayKey(-WEEKS * 7 + week * 7 - 2);
      const due = at(dueKey, "23:59");
      const publishedAt = new Date(due.getTime() - 7 * DAY_MS);
      const id = newId();
      assignmentRows.push({
        id,
        institutionId,
        courseId: course.id,
        title,
        description: instructions.slice(0, 500),
        instructions,
        dueDate: due,
        maxScore: 100,
        isPublished: true,
        publishedAt,
        allowLate: !upcoming,
        createdAt: publishedAt,
      });
      const gradeItemId = newId();
      gradeItemRows.push({ id: gradeItemId, institutionId, courseId: course.id, gradingPeriodId: course.gradingPeriodId, categoryId: course.categories.tasks, assignmentId: id, title, maxScore: 100, dueDate: due, isPublished: true });
      tasks.push({ id, courseIndex, title, week, due });

      for (const enrollment of enrollmentsOf(courseIndex)) {
        const student = enrollment.student;
        const profile = PROFILE[student.profile];
        const next = random(`tarea:${course.data.code}:${week}:${student.email}`);
        if (enrollment.withdrawnAt && due > enrollment.withdrawnAt) continue;
        // Un estudiante atrasado olvidó la práctica de la semana 6 de un curso: también sale en riesgo.
        const forgot = student.email === demoEmail("wilkin.santana") && course.data.code === "ENF-102" && week === 6;
        let submittedAt: Date;
        let late = false;
        if (upcoming) {
          if (next() >= profile.early) continue;
          submittedAt = past(new Date(now.getTime() - uniform(next, 0.3, 3) * DAY_MS), next);
        } else {
          if (forgot || next() < profile.missing) continue;
          late = next() < profile.lateTask;
          submittedAt = late
            ? past(new Date(due.getTime() + uniform(next, 0.2, 2.5) * DAY_MS), next)
            : new Date(due.getTime() - uniform(next, 0.1, 3) * DAY_MS);
        }
        const answers = handmade?.answers;
        const content = answers?.length
          ? answers[student.profile === "destacado" || student.profile === "regular" ? 0 : answers.length - 1]
          : pick(next, WEEKLY_ANSWERS)(topic);
        // Se califica lo que venció hace más de 4 días; la última semana queda casi toda por calificar.
        const graded = !upcoming && (week < WEEKS || next() < 0.3);
        const [low, high] = profile.score;
        const score = graded ? Math.max(0, Math.min(100, between(next, low, high) - (late ? 5 : 0))) : null;
        const gradedAt = graded ? past(new Date(Math.max(submittedAt.getTime(), due.getTime()) + uniform(next, 1.5, 4) * DAY_MS), next) : null;
        const feedback = score !== null ? feedbackFor(next, score) : null;
        submissionRows.push({
          institutionId,
          assignmentId: id,
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          content,
          status: graded ? "GRADED" : "SUBMITTED",
          submittedAt,
          score,
          feedback,
          gradedAt,
        });
        if (score !== null && gradedAt) {
          gradeEntryRows.push({ institutionId, gradeItemId, enrollmentId: enrollment.id, score, feedback, gradedById: course.teacherId, gradedAt, autoGraded: false });
        }
      }
    }
  }
  await inBatches(assignmentRows, (data) => db.assignment.createMany({ data }));
  await inBatches(gradeItemRows, (data) => db.gradeItem.createMany({ data }));
  const taskEntries = gradeEntryRows;
  await inBatches(submissionRows, (data) => db.submission.createMany({ data }), 1500);
  count("tareas", assignmentRows.length);
  count("entregas", submissionRows.length);

  // --- Exámenes, intentos y respuestas abiertas por revisar ----------------------------------------
  log("Creando exámenes y los intentos de los estudiantes…");
  const bankRows: Prisma.QuestionBankItemCreateManyInput[] = [];
  const examRows: Prisma.ExamCreateManyInput[] = [];
  const examQuestionRows: Prisma.ExamQuestionCreateManyInput[] = [];
  const examItemRows: Prisma.GradeItemCreateManyInput[] = [];
  const attemptRows: Prisma.ExamAttemptCreateManyInput[] = [];
  const answerRows: Prisma.ExamAnswerCreateManyInput[] = [];
  const examEntryRows: Prisma.GradeEntryCreateManyInput[] = [];
  const exams: Array<{ id: string; courseIndex: number; title: string }> = [];
  const opensKey = dayKey(-14);
  for (const [courseIndex, course] of built.entries()) {
    const examId = newId();
    const gradeItemId = newId();
    type Question = { bankItemId: string; type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER"; points: number; answerKey: string; options: string[] | null; samples?: [string, string, string] };
    const questions: Question[] = [];
    for (const question of course.data.exam.questions) {
      const options = question.type === "MULTIPLE_CHOICE" ? question.options : ["Verdadero", "Falso"];
      const answerKey = question.type === "MULTIPLE_CHOICE" ? question.options[question.correctIndex] : question.answer;
      questions.push({ bankItemId: newId(), type: question.type, points: 10, answerKey, options });
      bankRows.push({ id: questions.at(-1)!.bankItemId, institutionId, courseId: course.id, type: question.type, prompt: question.prompt, options, answerKey, explanation: question.explanation, defaultPoints: 10, createdAt: courseCreated });
    }
    const open = course.data.exam.shortAnswer;
    if (open) {
      questions.push({ bankItemId: newId(), type: "SHORT_ANSWER", points: 20, answerKey: open.answer, options: null, samples: open.samples });
      bankRows.push({ id: questions.at(-1)!.bankItemId, institutionId, courseId: course.id, type: "SHORT_ANSWER", prompt: open.prompt, answerKey: open.answer, explanation: open.explanation, defaultPoints: 20, createdAt: courseCreated });
    }
    const prompts = new Map(bankRows.filter((row) => row.courseId === course.id).map((row) => [row.id!, row]));
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    examRows.push({
      id: examId,
      institutionId,
      courseId: course.id,
      title: course.data.exam.title,
      instructions: course.data.exam.instructions,
      opensAt: at(opensKey, "07:00"),
      closesAt: at(dayKey(3), "23:00"),
      durationMinutes: 30,
      maxAttempts: 2,
      isPublished: true,
      showReview: true,
      passingPercent: 70,
      createdAt: at(dayKey(-16), "10:00"),
    });
    questions.forEach((question, order) => {
      const bank = prompts.get(question.bankItemId)!;
      examQuestionRows.push({
        institutionId,
        examId,
        bankItemId: question.bankItemId,
        order,
        points: question.points,
        snapshot: questionSnapshot({ type: question.type, prompt: bank.prompt, options: question.options, answerKey: question.answerKey }, question.points),
      });
    });
    examItemRows.push({ id: gradeItemId, institutionId, courseId: course.id, gradingPeriodId: course.gradingPeriodId, categoryId: course.categories.exams, examId, title: course.data.exam.title, maxScore, isPublished: true });
    exams.push({ id: examId, courseIndex, title: course.data.exam.title });

    for (const enrollment of enrollmentsOf(courseIndex)) {
      const student = enrollment.student;
      const profile = PROFILE[student.profile].exam;
      const next = random(`examen:${course.data.code}:${student.email}`);
      if (next() >= profile.take) continue;
      const firstDay = between(next, 2, 13);
      const days = [firstDay, ...(next() < profile.retry && firstDay > 2 ? [between(next, 1, firstDay - 1)] : [])];
      let lastGraded: { score: number; at: Date; reviewed: boolean } | null = null;
      for (const [attemptIndex, day] of days.entries()) {
        const startedAt = past(atOffset(-day, clock(next, 8, 21)), next);
        if (enrollment.withdrawnAt && startedAt > enrollment.withdrawnAt) break;
        const submittedAt = new Date(startedAt.getTime() + between(next, 12, 26) * 60_000);
        const attemptId = newId();
        const correct = Math.min(0.98, profile.correct + attemptIndex * 0.12);
        let auto = 0;
        let openScore: number | null = null;
        // Las respuestas abiertas de hace más de 4 días ya están revisadas; las recientes esperan al docente.
        const reviewed = day > 4;
        for (const question of questions) {
          let response: string;
          if (question.type === "SHORT_ANSWER") {
            const roll = next();
            const [best, middle] = profile.sample;
            const sample = roll < best ? 0 : roll < best + middle ? 1 : 2;
            response = question.samples![sample];
            const score = reviewed ? Math.round(question.points * [uniform(next, 0.85, 1), uniform(next, 0.4, 0.6), 0][sample]) : null;
            openScore = score;
            answerRows.push({ institutionId, attemptId, bankItemId: question.bankItemId, response, score, isCorrect: null, feedback: reviewed ? SHORT_FEEDBACK[sample] : null });
            continue;
          }
          const right = next() < correct;
          if (question.type === "TRUE_FALSE") response = right ? question.answerKey : question.answerKey === "Verdadero" ? "Falso" : "Verdadero";
          else response = right ? question.answerKey : pick(next, question.options!.filter((option) => option !== question.answerKey));
          const result = autoScoreAnswer(question.type, response, question.answerKey, question.points);
          auto += result.score ?? 0;
          answerRows.push({ institutionId, attemptId, bankItemId: question.bankItemId, response, score: result.score, isCorrect: result.isCorrect });
        }
        const needsReview = Boolean(open) && openScore === null;
        const score = auto + (openScore ?? 0);
        attemptRows.push({
          id: attemptId,
          institutionId,
          examId,
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          attemptNumber: attemptIndex + 1,
          status: needsReview ? "SUBMITTED" : "GRADED",
          score,
          maxScore,
          startedAt,
          expiresAt: new Date(startedAt.getTime() + 30 * 60_000),
          submittedAt,
        });
        if (!needsReview) lastGraded = { score, at: past(new Date(submittedAt.getTime() + (open ? 2 : 0) * DAY_MS), next), reviewed: Boolean(open) };
      }
      if (lastGraded) {
        examEntryRows.push({ institutionId, gradeItemId, enrollmentId: enrollment.id, score: lastGraded.score, gradedById: course.teacherId, gradedAt: lastGraded.at, autoGraded: !lastGraded.reviewed });
      }
    }
  }
  await db.questionBankItem.createMany({ data: bankRows });
  await db.exam.createMany({ data: examRows });
  await db.examQuestion.createMany({ data: examQuestionRows });
  await db.gradeItem.createMany({ data: examItemRows });
  await inBatches(attemptRows, (data) => db.examAttempt.createMany({ data }));
  await inBatches(answerRows, (data) => db.examAnswer.createMany({ data }), 2000);
  await inBatches([...taskEntries, ...examEntryRows], (data) => db.gradeEntry.createMany({ data }), 2000);
  count("exámenes", examRows.length);
  count("preguntas", bankRows.length);
  count("intentos de examen", attemptRows.length);
  count("notas en el libro", taskEntries.length + examEntryRows.length);

  // --- Clases en vivo próximas ---------------------------------------------------------------------
  log("Programando clases en vivo…");
  const liveRows: Prisma.LiveClassCreateManyInput[] = [];
  for (const course of built) {
    const live = course.data.liveClass;
    for (let week = 0; week < Math.max(1, live.weeks); week += 1) {
      const date = dayKey(live.daysFromToday + week * 7);
      let startsAt = at(date, live.time);
      // La de hoy se mueve a dentro de dos horas para que siempre haya una clase a punto de empezar.
      if (startsAt <= now) startsAt = new Date(Math.ceil((now.getTime() + 2 * 60 * 60_000) / (15 * 60_000)) * 15 * 60_000);
      liveRows.push({
        institutionId,
        courseId: course.id,
        title: live.title,
        description: live.description,
        startsAt,
        durationMinutes: live.durationMinutes,
        joinUrl: `https://meet.jit.si/EdukanaDemo-${course.data.code}`,
        createdById: course.teacherId,
        createdAt: atOffset(-4, "09:00"),
      });
    }
  }
  await db.liveClass.createMany({ data: liveRows });
  count("clases en vivo", liveRows.length);

  // --- Avisos --------------------------------------------------------------------------------------
  log("Publicando avisos…");
  const coordinatorId = userId(COORDINATOR.email);
  const nursing = built.filter((course) => course.data.program === "ENF").map((course) => course.id);
  const accounting = built.filter((course) => course.data.program === "CON").map((course) => course.id);
  const technical = ["INF-101", "ELE-101", "ELE-102"].map((code) => courseByCode(code).id);
  const announcements = [
    {
      authorId: adminId,
      title: `¡Bienvenidos al ${periodName(current.start, current.end)}!`,
      content: "Les damos la bienvenida a este nuevo cuatrimestre. Revisen su horario en la sección Calendario y entren a sus cursos para ver las lecciones de la primera unidad. Cualquier duda, la coordinación está disponible de lunes a viernes de 8:00 a. m. a 8:00 p. m.",
      institution: true,
      pinned: true,
      daysAgo: 56,
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
      authorId: coordinatorId,
      title: "Charla sobre facturación electrónica",
      content: "Los estudiantes de Contabilidad están invitados a la charla sobre facturación electrónica y comprobantes fiscales. Será en el Aula 205, de 6:00 a 7:30 p. m. Traigan sus preguntas sobre el cierre fiscal de fin de año.",
      institution: false,
      pinned: false,
      daysAgo: 5,
      roles: [],
      courses: accounting,
    },
    {
      authorId: coordinatorId,
      title: "Feria de empleo técnico: inscripciones abiertas",
      content: "El sábado de la próxima semana recibimos a empresas de electricidad, energía solar y soporte técnico que buscan pasantes. Lleven su currículum impreso. Inscríbanse con la coordinación antes del jueves.",
      institution: false,
      pinned: false,
      daysAgo: 1,
      roles: [],
      courses: technical,
    },
    {
      authorId: adminId,
      title: `Recordatorio: mensualidad de ${monthOf(lastDue)}`,
      content: `La mensualidad de ${monthOf(lastDue)} vence el ${Number(lastDue.slice(8, 10))} de ${monthOf(lastDue)}. Pueden pagar en caja, por transferencia o con tarjeta. Si tienen algún inconveniente, pasen por administración para acordar un plan de pago.`,
      institution: false,
      pinned: false,
      daysAgo: 2,
      roles: ["STUDENT", "PARENT"] as EdukanaRole[],
      courses: [],
    },
    {
      authorId: adminId,
      title: "Reunión de docentes: cierre de la mitad del cuatrimestre",
      content: "Nos reunimos el viernes a las 5:00 p. m. en la sala de profesores para revisar asistencia, estudiantes en riesgo y notas de la mitad del cuatrimestre. Traigan su libro de calificaciones al día.",
      institution: false,
      pinned: false,
      daysAgo: 4,
      roles: ["TEACHER", "COORDINATOR"] as EdukanaRole[],
      courses: [],
    },
  ];
  for (const item of announcements) {
    const legacy = item.institution
      ? { audience: "ALL" as const, audienceId: null }
      : item.courses.length === 1 && !item.roles.length
        ? { audience: "COURSE" as const, audienceId: item.courses[0] }
        : { audience: "ROLE" as const, audienceId: item.roles.length === 1 && !item.courses.length ? item.roles[0] : null };
    const publishedAt = new Date(now.getTime() - item.daysAgo * DAY_MS);
    await db.announcement.create({
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
  }
  count("avisos", announcements.length);

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
      createdAt: joined,
    })),
  });
  count("tutores vinculados", GUARDIANS.length);

  // --- Cobros: inscripción y tres mensualidades por estudiante de grupo ----------------------------
  log("Creando cobros y pagos…");
  const chargeRows: Prisma.PaymentConceptCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const methods = ["TRANSFER", "CASH", "CARD", "TRANSFER"] as const;
  const payNote = (method: string, next: Rand) =>
    method === "TRANSFER" ? `Transferencia ${pick(next, ["Banreservas", "Banco Popular", "BHD", "Banco Santa Cruz"])}, ref. ${between(next, 10000, 99999)}` : method === "CARD" ? "Pago con tarjeta en caja." : "Pago en efectivo en caja.";
  /** Parte pagada (0 a 1) de cada cobro según el perfil. */
  const paidShare = (kind: "inscripcion" | 1 | 2 | 3, profile: StudentProfile, next: Rand) => {
    const roll = next();
    if (kind === "inscripcion") return profile === "en_riesgo" && roll < 0.3 ? 0.5 : 1;
    if (kind === 1) return profile === "en_riesgo" ? (roll < 0.6 ? 1 : 0.5) : 1;
    if (kind === 2) {
      if (profile === "destacado") return 1;
      if (profile === "regular") return roll < 0.9 ? 1 : roll < 0.95 ? 0.5 : 0;
      if (profile === "atrasado") return roll < 0.5 ? 1 : 0.5;
      return roll < 0.25 ? 0.5 : 0;
    }
    if (profile === "destacado") return roll < 0.9 ? 1 : 0;
    if (profile === "regular") return roll < 0.55 ? 1 : 0;
    return profile === "atrasado" && roll < 0.2 ? 1 : 0;
  };
  const charge = (studentId: string, concept: string, cents: number, dueKey: string, share: number, next: Rand, paidOffset: number) => {
    const id = newId();
    const paidCents = Math.round(cents * share);
    const status = paidCents >= cents ? "PAID" : paidCents > 0 ? "PARTIAL" : "PENDING";
    const paidKey = dayKey(Math.min(-1, paidOffset));
    chargeRows.push({
      id,
      institutionId,
      studentId,
      periodId,
      concept,
      amount: cents / 100,
      amountCents: cents,
      currency: "DOP",
      dueDate: storedDay(dueKey),
      status,
      paidAt: status === "PAID" ? storedDay(paidKey) : null,
      createdAt: new Date(storedDay(dueKey).getTime() - 20 * DAY_MS),
    });
    if (paidCents > 0) {
      const method = pick(next, methods);
      paymentRows.push({ institutionId, conceptId: id, amountCents: paidCents, method, paidOn: storedDay(paidKey), note: payNote(method, next), recordedById: adminId, createdAt: at(paidKey, clock(next, 8, 17)) });
    }
  };
  for (const student of STUDENTS.filter((row) => row.group)) {
    const info = PROGRAMS[student.track as "ENF" | "CON"];
    const id = userId(student.email);
    const next = random(`cobros:${student.email}`);
    const enrollDue = dayKey(PERIOD_START + 3);
    charge(id, `Inscripción ${periodName(current.start, current.end)} · ${info.name}`, info.enrollmentFeeCents, enrollDue, paidShare("inscripcion", student.profile, next), next, PERIOD_START + between(next, -6, 2));
    monthDues.forEach((dueKey, index) => {
      charge(id, `Mensualidad de ${monthOf(dueKey)} · ${info.name}`, info.monthlyFeeCents, dueKey, paidShare((index + 1) as 1 | 2 | 3, student.profile, next), next, offsetOf(dueKey) + between(next, -5, 3));
    });
  }
  // Excel: cuatro lo compraron en el catálogo (pedido pagado); los otros dos pagan en caja.
  const buyers = ["altagracia.henriquez", "manuel.rosario", "indhira.vasquez", "wendy.marte"].map(demoEmail);
  for (const student of STUDENTS.filter((row) => row.track === "EXCEL" && !buyers.includes(row.email))) {
    const next = random(`excel:${student.email}`);
    charge(userId(student.email), "Curso Excel para la Oficina", courseByCode("EXC-100").data.catalogPriceCents ?? 250000, dayKey(PERIOD_START + 7), student.profile === "atrasado" ? 0.4 : 1, next, PERIOD_START + between(next, 2, 10));
  }
  await inBatches(chargeRows, (data) => db.paymentConcept.createMany({ data }));
  await inBatches(paymentRows, (data) => db.payment.createMany({ data }));
  count("cobros", chargeRows.length);
  count("pagos", paymentRows.length);

  // --- Catálogo: pedidos pagados y reseñas ---------------------------------------------------------
  const excel = courseByCode("EXC-100");
  const orders = buyers.map((email, index) => {
    const next = random(`pedido:${email}`);
    const paid = atOffset(PERIOD_START - 6 + index * 2, clock(next, 9, 20));
    return {
      institutionId,
      courseId: excel.id,
      buyerId: userId(email),
      amountCents: excel.data.catalogPriceCents ?? 250000,
      currency: "DOP",
      status: "PAID",
      paymentMethod: index % 2 ? "CARD" : "TRANSFER",
      paymentNote: index % 2 ? "Pago con tarjeta en caja." : `Transferencia Banco Popular, ref. ${between(next, 10000, 99999)}`,
      paidAt: paid,
      createdAt: new Date(paid.getTime() - between(next, 2, 30) * 60 * 60_000),
    };
  });
  await db.courseOrder.createMany({ data: orders });
  await db.courseReview.createMany({
    data: [
      { institutionId, courseId: excel.id, userId: userId(demoEmail("altagracia.henriquez")), rating: 5, comment: "Muy práctico. Ya hago los reportes de ventas de la tienda yo sola y en la mitad del tiempo.", createdAt: atOffset(-2, "20:15") },
      { institutionId, courseId: excel.id, userId: userId(demoEmail("wendy.marte")), rating: 4, comment: "La profesora explica con paciencia. Me hubiera gustado una clase más de gráficos.", createdAt: atOffset(-1, "21:40") },
    ],
  });
  count("pedidos del catálogo", orders.length);
  count("reseñas", 2);

  // --- Certificados de Excel -----------------------------------------------------------------------
  log("Emitiendo certificados…");
  const certificateSecret = process.env.CERTIFICATE_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (certificateSecret) {
    const certificates = enrollmentsOf(excelIndex)
      .filter((row) => certified.includes(row.student.email))
      .map((row) => {
        const identity = createCertificateIdentity(row.id, excel.id, certificateSecret);
        const entries = [...taskEntries, ...examEntryRows].filter((entry) => entry.enrollmentId === row.id && typeof entry.score === "number");
        const grade = entries.length ? Math.round(entries.reduce((sum, entry) => sum + Number(entry.score), 0) / entries.length) : null;
        return {
          institutionId,
          courseId: excel.id,
          enrollmentId: row.id,
          issuedById: excel.teacherId,
          verificationCode: identity.code,
          verificationHash: identity.verificationHash,
          issuedAt: atOffset(-2, "10:00"),
          metadata: { studentName: row.student.name, progressPercent: 100, grade },
        };
      });
    await db.certificate.createMany({ data: certificates });
    count("certificados", certificates.length);
  } else {
    warnings.push("No se emitieron los certificados porque falta CERTIFICATE_SECRET (o AUTH_SECRET). Los estudiantes quedaron con Excel completado; emítelos desde la pantalla de certificados del curso.");
  }

  // --- Solicitudes de admisión ---------------------------------------------------------------------
  log("Registrando solicitudes de admisión…");
  const leadRows: Prisma.AdmissionLeadCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const STEPS = ["INTERESTED", "DOCUMENTS", "REVIEW", "ACCEPTED"] as const;
  const groupForTrack = (student: DemoStudent) => (student.group ? groupIdByKey.get(student.group) ?? null : null);
  for (const lead of LEADS) {
    const id = newId();
    const createdAt = new Date(now.getTime() - lead.daysAgo * DAY_MS);
    const convertedUserId = lead.student ? userId(lead.student.email) : null;
    const convertedAt = lead.student ? new Date(enrolledAt.getTime() - 3 * DAY_MS) : null;
    leadRows.push({
      id,
      institutionId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      programInterest: lead.programInterest,
      source: lead.source,
      notes: lead.notes,
      stage: lead.stage,
      convertedUserId,
      convertedAt,
      createdAt,
      updatedAt: convertedAt ?? new Date(createdAt.getTime() + DAY_MS),
    });
    auditRows.push({ institutionId, userId: coordinatorId, action: "ADMISSION_CREATED", entity: "AdmissionLead", entityId: id, changes: { stage: "INTERESTED", source: lead.source }, createdAt });
    const final = lead.stage === "ENROLLED" ? "ACCEPTED" : lead.stage;
    const path = final === "REJECTED" ? ["REJECTED"] : STEPS.slice(1, STEPS.indexOf(final as (typeof STEPS)[number]) + 1);
    let from: string = "INTERESTED";
    path.forEach((to, step) => {
      auditRows.push({
        institutionId,
        userId: coordinatorId,
        action: "ADMISSION_STAGE_CHANGED",
        entity: "AdmissionLead",
        entityId: id,
        changes: { from, to, ...(to === "REJECTED" && lead.reason ? { reason: lead.reason } : {}) },
        createdAt: new Date(createdAt.getTime() + (step + 1) * 12 * 60 * 60_000),
      });
      from = to;
    });
    if (lead.student && convertedUserId && convertedAt) {
      auditRows.push({
        institutionId,
        userId: adminId,
        action: "ADMISSION_CONVERTED",
        entity: "AdmissionLead",
        entityId: id,
        changes: { from: "ACCEPTED", to: "ENROLLED", userId: convertedUserId, created: true, groupId: groupForTrack(lead.student) },
        createdAt: convertedAt,
      });
    }
  }
  await db.admissionLead.createMany({ data: leadRows });
  await db.auditLog.createMany({ data: auditRows });
  count("solicitudes de admisión", leadRows.length);

  // --- Notificaciones en la aplicación -------------------------------------------------------------
  log("Dejando notificaciones…");
  const notificationRows: Prisma.NotificationCreateManyInput[] = [];
  const gradedKeys = new Set(submissionRows.filter((row) => row.status === "GRADED").map((row) => `${row.assignmentId}:${row.enrollmentId}`));
  const enrollmentById = new Map(enrollments.map((row) => [row.id, row]));
  const fee = (cents: number) => `RD$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  for (const enrollment of enrollments.filter((row) => row.status === "ACTIVE")) {
    const course = built[enrollment.courseIndex];
    const courseTasks = tasks.filter((task) => task.courseIndex === enrollment.courseIndex);
    const upcoming = courseTasks.at(-1)!;
    const lastGraded = courseTasks.find((task) => task.week === WEEKS - 1)!;
    const exam = exams.find((row) => row.courseIndex === enrollment.courseIndex)!;
    const next = random(`avisos:${course.data.code}:${enrollment.student.email}`);
    notificationRows.push({
      institutionId,
      userId: enrollment.studentId,
      kind: "assignment",
      title: `Nueva tarea en ${course.data.name}: ${upcoming.title}`,
      body: "Revisa la fecha límite en la tarea.",
      href: `/dashboard/aula/${course.id}/tareas/${upcoming.id}`,
      readAt: next() < 0.4 ? new Date(now.getTime() - DAY_MS) : null,
      createdAt: new Date(upcoming.due.getTime() - 7 * DAY_MS),
    });
    if (gradedKeys.has(`${lastGraded.id}:${enrollment.id}`)) {
      notificationRows.push({
        institutionId,
        userId: enrollment.studentId,
        kind: "grade",
        title: `Ya tienes nota en «${lastGraded.title}»`,
        body: `Curso: ${course.data.name}. Abre la tarea para ver tu nota y los comentarios.`,
        href: `/dashboard/aula/${course.id}/tareas/${lastGraded.id}`,
        readAt: next() < 0.6 ? new Date(now.getTime() - 2 * DAY_MS) : null,
        createdAt: new Date(lastGraded.due.getTime() + 3 * DAY_MS),
      });
    }
    notificationRows.push({
      institutionId,
      userId: enrollment.studentId,
      kind: "exam",
      title: `Nuevo examen en ${course.data.name}: ${exam.title}`,
      body: "Tienes 30 minutos y dos intentos.",
      href: `/dashboard/aula/${course.id}/presentar`,
      readAt: new Date(now.getTime() - 10 * DAY_MS),
      createdAt: at(opensKey, "07:00"),
    });
  }
  for (const row of chargeRows.filter((item) => item.status === "PENDING" && (item.dueDate as Date) > now)) {
    notificationRows.push({
      institutionId,
      userId: row.studentId!,
      kind: "charge",
      title: `Nuevo cargo: ${row.concept}`,
      body: `${fee(row.amountCents!)}, vence el ${Number(zonedDateKey(row.dueDate as Date, TIME_ZONE).slice(8, 10))} de ${monthOf(zonedDateKey(row.dueDate as Date, TIME_ZONE))}.`,
      href: "/dashboard/mi-cuenta",
      createdAt: row.createdAt as Date,
    });
  }
  // Docentes: las entregas más recientes de cada curso, por revisar.
  for (const task of tasks.filter((row) => row.week === WEEKS)) {
    const course = built[task.courseIndex];
    const recent = submissionRows
      .filter((row) => row.assignmentId === task.id && row.status === "SUBMITTED")
      .sort((a, b) => (b.submittedAt as Date).getTime() - (a.submittedAt as Date).getTime())
      .slice(0, 3);
    for (const submission of recent) {
      const student = enrollmentById.get(submission.enrollmentId)!.student;
      notificationRows.push({
        institutionId,
        userId: course.teacherId,
        kind: "submission",
        title: `${student.name} entregó «${task.title}»`,
        body: `Curso: ${course.data.name}. Ya puedes revisarla y calificarla.`,
        href: `/dashboard/aula/${course.id}/tareas/${task.id}`,
        createdAt: submission.submittedAt as Date,
      });
    }
  }
  await inBatches(notificationRows, (data) => db.notification.createMany({ data }));
  count("notificaciones", notificationRows.length);

  return { warnings, counts };
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
 * Lo demás (personas, programas, grupos, solicitudes, notificaciones, pedidos…) se va en cascada
 * con la institución.
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
    await tx.platformInvoice.deleteMany({ where: scope });
    await tx.institutionSubscription.deleteMany({ where: scope });
    await tx.institution.delete({ where: { id: institutionId } });
    const identities = await tx.identity.deleteMany({ where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, users: { none: {} } } });
    return { removed: true, identitiesRemoved: identities.count };
  }, { timeout: 180_000, maxWait: 20_000 });
}
