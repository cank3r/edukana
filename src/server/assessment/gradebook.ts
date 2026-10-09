import "server-only";

import { z } from "zod";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { courseWhereForScope, resolveCourseWriteScope } from "@/lib/course-scope";
import { db } from "@/lib/db";
import { buildCsv, categoryWeightsProblem, courseAverage, formatNumber, type AveragePeriod } from "@/lib/gradebook-calc";
import { writeGradeEntry } from "@/server/grade-history";
import type { EdukanaRole } from "@/types/next-auth";

export type GradebookActor = { id: string; institutionId: string; role: EdukanaRole };
export type GradebookResult = { ok: true; message: string } | { ok: false; message: string };

const NO_ACCESS = "No encontramos ese curso o no tienes permiso para calificarlo.";
const NO_ITEM = "No encontramos esa actividad en tus cursos.";
/** Matrículas que aparecen en el libro: quien se retiró no se califica. */
const GRADED_STATUSES = ["ACTIVE", "COMPLETED", "FAILED"] as const;
const SIMPLE_PERIOD = "Notas del curso";
const SIMPLE_CATEGORY = "General";

const fail = (message: string) => ({ ok: false, message }) as const;
const done = (message: string) => ({ ok: true, message }) as const;

/** Filtro de cursos que esta persona puede calificar dentro de su institución; null si ninguno. */
async function manageWhere(actor: GradebookActor) {
  if (!actor.institutionId) return null;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  return courseWhereForScope(actor.institutionId, resolveCourseWriteScope(actor, capabilities));
}

async function manageableCourse(actor: GradebookActor, courseId: string) {
  const where = await manageWhere(actor);
  if (!where || !courseId) return null;
  return db.course.findFirst({
    where: { AND: [{ id: courseId }, where] },
    select: { id: true, name: true, code: true, periodId: true, period: { select: { startDate: true, endDate: true } } },
  });
}

/** Una actividad calificable de un curso que esta persona gestiona. */
async function manageableItem(actor: GradebookActor, gradeItemId: string) {
  const where = await manageWhere(actor);
  if (!where || !gradeItemId) return null;
  return db.gradeItem.findFirst({
    where: { id: gradeItemId, institutionId: actor.institutionId, course: where },
    select: { id: true, courseId: true, title: true, maxScore: true, assignmentId: true, examId: true, isPublished: true },
  });
}

// ---------------------------------------------------------------------------------------
// Lectura del libro
// ---------------------------------------------------------------------------------------

export type GradebookItem = {
  id: string;
  title: string;
  maxScore: number;
  isPublished: boolean;
  categoryId: string;
  categoryName: string;
  periodName: string;
  source: "manual" | "assignment" | "exam";
  sourceId: string | null;
  gradedCount: number;
};
export type GradebookCell = { score: number | null; isExcused: boolean; feedback: string | null };
export type GradebookStudent = {
  enrollmentId: string;
  name: string;
  email: string;
  average: number | null;
  cells: Record<string, GradebookCell>;
};
export type GradebookPeriod = {
  id: string;
  name: string;
  categories: Array<{ id: string; name: string; weight: number; itemCount: number }>;
};
export type Gradebook = {
  course: { id: string; name: string; code: string | null };
  periods: GradebookPeriod[];
  items: GradebookItem[];
  students: GradebookStudent[];
};

type PeriodShape = {
  weight: number;
  categories: Array<{ weight: number; dropLowest: number; items: Array<{ id: string; maxScore: number; weight: number }> }>;
};

/** Promedio de una persona a partir de sus celdas; solo cuentan las actividades que se le pasan. */
function averageFor(periods: PeriodShape[], cells: Record<string, GradebookCell>): number | null {
  const input: AveragePeriod[] = periods.map((period) => ({
    weight: period.weight,
    categories: period.categories.map((category) => ({
      weight: category.weight,
      dropLowest: category.dropLowest,
      scores: category.items.map((item) => ({
        score: cells[item.id]?.score ?? null,
        maxScore: item.maxScore,
        itemWeight: item.weight,
        excused: cells[item.id]?.isExcused ?? false,
      })),
    })),
  }));
  return courseAverage(input);
}

/**
 * El libro completo de un curso en cuatro consultas fijas (curso, configuración, matrículas y
 * notas), sin importar cuántos estudiantes o actividades haya. Null si no puede gestionarlo.
 */
export async function loadGradebook(actor: GradebookActor, courseId: string): Promise<Gradebook | null> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return null;
  const scope = { institutionId: actor.institutionId, courseId: course.id };
  const [periods, enrollments, entries] = await Promise.all([
    db.gradingPeriod.findMany({
      where: scope,
      orderBy: [{ startDate: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        weight: true,
        categories: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            weight: true,
            dropLowest: true,
            items: {
              orderBy: [{ dueDate: "asc" }, { title: "asc" }],
              select: { id: true, title: true, maxScore: true, weight: true, isPublished: true, assignmentId: true, examId: true },
            },
          },
        },
      },
    }),
    db.enrollment.findMany({
      where: { ...scope, status: { in: [...GRADED_STATUSES] } },
      orderBy: { student: { name: "asc" } },
      select: { id: true, student: { select: { name: true, email: true } } },
    }),
    db.gradeEntry.findMany({
      where: { institutionId: actor.institutionId, gradeItem: { courseId: course.id } },
      select: { gradeItemId: true, enrollmentId: true, score: true, isExcused: true, feedback: true },
    }),
  ]);

  const cellsByEnrollment = new Map<string, Record<string, GradebookCell>>();
  const gradedByItem = new Map<string, number>();
  for (const entry of entries) {
    const cells = cellsByEnrollment.get(entry.enrollmentId) ?? {};
    cells[entry.gradeItemId] = { score: entry.score, isExcused: entry.isExcused, feedback: entry.feedback };
    cellsByEnrollment.set(entry.enrollmentId, cells);
    gradedByItem.set(entry.gradeItemId, (gradedByItem.get(entry.gradeItemId) ?? 0) + 1);
  }

  const items: GradebookItem[] = periods.flatMap((period) =>
    period.categories.flatMap((category) =>
      category.items.map((item) => ({
        id: item.id,
        title: item.title,
        maxScore: item.maxScore,
        isPublished: item.isPublished,
        categoryId: category.id,
        categoryName: category.name,
        periodName: period.name,
        source: item.assignmentId ? ("assignment" as const) : item.examId ? ("exam" as const) : ("manual" as const),
        sourceId: item.assignmentId ?? item.examId,
        gradedCount: gradedByItem.get(item.id) ?? 0,
      })),
    ),
  );

  return {
    course: { id: course.id, name: course.name, code: course.code },
    periods: periods.map((period) => ({
      id: period.id,
      name: period.name,
      categories: period.categories.map((category) => ({ id: category.id, name: category.name, weight: category.weight, itemCount: category.items.length })),
    })),
    items,
    students: enrollments.map((enrollment) => {
      const cells = cellsByEnrollment.get(enrollment.id) ?? {};
      return { enrollmentId: enrollment.id, name: enrollment.student.name, email: enrollment.student.email, average: averageFor(periods, cells), cells };
    }),
  };
}

export type GradeCellDetail = {
  item: { id: string; title: string; maxScore: number; isPublished: boolean };
  student: { enrollmentId: string; name: string };
  entry: { score: number | null; feedback: string | null; isExcused: boolean } | null;
  history: Array<{ id: string; who: string; when: Date; from: number | null; to: number | null; reason: string | null }>;
};

/** Una nota con su historial de cambios, para el editor del docente. */
export async function loadGradeCell(actor: GradebookActor, gradeItemId: string, enrollmentId: string): Promise<GradeCellDetail | null> {
  const item = await manageableItem(actor, gradeItemId);
  if (!item || !enrollmentId) return null;
  const [enrollment, entry] = await Promise.all([
    db.enrollment.findFirst({
      where: { id: enrollmentId, institutionId: actor.institutionId, courseId: item.courseId, status: { in: [...GRADED_STATUSES] } },
      select: { id: true, student: { select: { name: true } } },
    }),
    db.gradeEntry.findFirst({
      where: { gradeItemId: item.id, enrollmentId, institutionId: actor.institutionId },
      select: {
        score: true,
        feedback: true,
        isExcused: true,
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, previousScore: true, newScore: true, reason: true, createdAt: true, actor: { select: { name: true } } },
        },
      },
    }),
  ]);
  if (!enrollment) return null;
  return {
    item: { id: item.id, title: item.title, maxScore: item.maxScore, isPublished: item.isPublished },
    student: { enrollmentId: enrollment.id, name: enrollment.student.name },
    entry: entry ? { score: entry.score, feedback: entry.feedback, isExcused: entry.isExcused } : null,
    history: (entry?.revisions ?? []).map((revision) => ({
      id: revision.id,
      who: revision.actor.name,
      when: revision.createdAt,
      from: revision.previousScore,
      to: revision.newScore,
      reason: revision.reason,
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Configuración: período, categorías y actividades
// ---------------------------------------------------------------------------------------

/** Arranque de un clic: un período y una categoría «General» que vale el 100 %. */
export async function setupSimpleGrading(actor: GradebookActor, courseId: string): Promise<GradebookResult> {
  const course = await manageableCourse(actor, courseId);
  if (!course) return fail(NO_ACCESS);
  const scope = { institutionId: actor.institutionId, courseId: course.id };
  return db.$transaction(async (tx) => {
    if (await tx.gradingPeriod.count({ where: scope })) return fail("Este curso ya tiene su configuración de notas.");
    await tx.gradingPeriod.create({
      data: {
        ...scope,
        academicPeriodId: course.periodId,
        name: SIMPLE_PERIOD,
        startDate: course.period.startDate,
        endDate: course.period.endDate,
        categories: { create: { ...scope, name: SIMPLE_CATEGORY, weight: 100 } },
      },
    });
    return done("Listo. Ya puedes agregar actividades y poner notas.");
  });
}

const categoriesSchema = z
  .array(
    z.object({
      id: z.string().max(60).optional(),
      name: z.string().trim().min(2, "Escribe el nombre de cada categoría.").max(60, "El nombre de la categoría es demasiado largo."),
      weight: z.number({ message: "Escribe el peso de cada categoría." }),
    }),
  )
  .max(20, "Son demasiadas categorías.");

/**
 * Guarda de una vez las categorías de un período. Las que no vienen se borran, pero solo si no
 * tienen actividades. Los pesos deben sumar 100.
 */
export async function saveCategories(
  actor: GradebookActor,
  input: { courseId: string; gradingPeriodId: string; categories: Array<{ id?: string; name: string; weight: number }> },
): Promise<GradebookResult> {
  const course = await manageableCourse(actor, input.courseId);
  if (!course) return fail(NO_ACCESS);
  const parsed = categoriesSchema.safeParse(input.categories);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa las categorías.");
  const rows = parsed.data;
  const problem = categoryWeightsProblem(rows.map((row) => row.weight));
  if (problem) return fail(problem);
  const names = rows.map((row) => row.name.toLocaleLowerCase("es"));
  if (new Set(names).size !== names.length) return fail("Hay dos categorías con el mismo nombre. Cambia uno.");

  const scope = { institutionId: actor.institutionId, courseId: course.id };
  return db.$transaction(async (tx) => {
    const period = await tx.gradingPeriod.findFirst({
      where: { id: input.gradingPeriodId, ...scope },
      select: { id: true, categories: { select: { id: true, name: true, _count: { select: { items: true } } } } },
    });
    if (!period) return fail("No encontramos ese período en este curso.");
    const existing = new Map(period.categories.map((category) => [category.id, category]));
    if (rows.some((row) => row.id && !existing.has(row.id))) return fail("Una de las categorías ya no existe. Recarga la página.");
    const kept = new Set(rows.flatMap((row) => (row.id ? [row.id] : [])));
    const removed = period.categories.filter((category) => !kept.has(category.id));
    const blocked = removed.find((category) => category._count.items > 0);
    if (blocked) {
      return fail(`«${blocked.name}» tiene ${blocked._count.items} actividades. Muévelas a otra categoría antes de quitarla.`);
    }
    await tx.gradeCategory.deleteMany({ where: { id: { in: removed.map((category) => category.id) }, ...scope } });
    // Nombre provisional primero: así dos categorías pueden intercambiar nombres sin chocar.
    for (const row of rows) {
      if (row.id && existing.get(row.id)?.name !== row.name) {
        await tx.gradeCategory.update({ where: { id: row.id }, data: { name: `${row.name} · ${row.id}` } });
      }
    }
    for (const row of rows) {
      if (row.id) await tx.gradeCategory.update({ where: { id: row.id }, data: { name: row.name, weight: row.weight } });
      else await tx.gradeCategory.create({ data: { ...scope, gradingPeriodId: period.id, name: row.name, weight: row.weight } });
    }
    return done("Categorías guardadas.");
  });
}

const itemSchema = z.object({
  title: z.string().trim().min(2, "Escribe un título para la actividad.").max(140, "El título es demasiado largo."),
  maxScore: z.number({ message: "Escribe el puntaje máximo." }).positive("El puntaje máximo debe ser mayor que cero.").max(10000, "El puntaje máximo es demasiado alto."),
  categoryId: z.string().min(1, "Elige una categoría."),
});

type ItemInput = { title: string; maxScore: number; categoryId: string };

/** Crea una actividad calificable que no viene de una tarea ni de un examen. Nace oculta. */
export async function createManualItem(actor: GradebookActor, input: ItemInput & { courseId: string }): Promise<GradebookResult> {
  const course = await manageableCourse(actor, input.courseId);
  if (!course) return fail(NO_ACCESS);
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const scope = { institutionId: actor.institutionId, courseId: course.id };
  const category = await db.gradeCategory.findFirst({ where: { id: parsed.data.categoryId, ...scope }, select: { id: true, gradingPeriodId: true } });
  if (!category) return fail("Elige una categoría de este curso.");
  await db.gradeItem.create({
    data: { ...scope, gradingPeriodId: category.gradingPeriodId, categoryId: category.id, title: parsed.data.title, maxScore: parsed.data.maxScore },
  });
  return done("Actividad agregada. Ya puedes poner sus notas.");
}

/** Edita una actividad manual. Las de tareas y exámenes se cambian en su propia pantalla. */
export async function updateManualItem(actor: GradebookActor, input: ItemInput & { gradeItemId: string }): Promise<GradebookResult> {
  const item = await manageableItem(actor, input.gradeItemId);
  if (!item) return fail(NO_ITEM);
  if (item.assignmentId || item.examId) return fail("Esta actividad viene de una tarea o un examen. Cámbiala desde su pantalla.");
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const scope = { institutionId: actor.institutionId, courseId: item.courseId };
  const [category, highest] = await Promise.all([
    db.gradeCategory.findFirst({ where: { id: parsed.data.categoryId, ...scope }, select: { id: true, gradingPeriodId: true } }),
    db.gradeEntry.aggregate({ where: { gradeItemId: item.id }, _max: { score: true } }),
  ]);
  if (!category) return fail("Elige una categoría de este curso.");
  const top = highest._max.score;
  if (top !== null && top > parsed.data.maxScore) {
    return fail(`Ya hay una nota de ${formatNumber(top)}. El puntaje máximo no puede ser menor que eso.`);
  }
  await db.gradeItem.update({
    where: { id: item.id },
    data: { title: parsed.data.title, maxScore: parsed.data.maxScore, categoryId: category.id, gradingPeriodId: category.gradingPeriodId },
  });
  return done("Actividad actualizada.");
}

/** Borra una actividad manual junto con sus notas. */
export async function deleteManualItem(actor: GradebookActor, gradeItemId: string): Promise<GradebookResult> {
  const item = await manageableItem(actor, gradeItemId);
  if (!item) return fail(NO_ITEM);
  if (item.assignmentId || item.examId) return fail("Esta actividad viene de una tarea o un examen. Bórrala desde su pantalla.");
  await db.gradeItem.deleteMany({ where: { id: item.id, institutionId: actor.institutionId } });
  return done(`Se borró «${item.title}» con sus notas.`);
}

/** Publica u oculta las notas de una actividad. El estudiante solo ve lo publicado. */
export async function setItemPublished(actor: GradebookActor, gradeItemId: string, published: boolean): Promise<GradebookResult> {
  const item = await manageableItem(actor, gradeItemId);
  if (!item) return fail(NO_ITEM);
  await db.gradeItem.updateMany({ where: { id: item.id, institutionId: actor.institutionId }, data: { isPublished: published } });
  return done(published ? `Los estudiantes ya pueden ver sus notas de «${item.title}».` : `Las notas de «${item.title}» quedaron ocultas para los estudiantes.`);
}

// ---------------------------------------------------------------------------------------
// Escritura de notas
// ---------------------------------------------------------------------------------------

export type SaveGradeInput = {
  gradeItemId: string;
  enrollmentId: string;
  /** null = sin nota (solo válido si queda exonerado o se quita una exoneración sin nota). */
  score: number | null;
  feedback?: string | null;
  isExcused?: boolean;
  /** Motivo del cambio; obligatorio si ya había una nota distinta. */
  reason?: string | null;
};

/**
 * Pone o corrige una nota. La nota siempre pasa por `writeGradeEntry`, que guarda la revisión.
 * Si ya había una nota distinta se exige el motivo aquí, esté o no publicado el período.
 */
export async function saveGrade(actor: GradebookActor, input: SaveGradeInput, now = new Date()): Promise<GradebookResult> {
  const item = await manageableItem(actor, input.gradeItemId);
  if (!item) return fail(NO_ITEM);
  const score = input.score;
  const isExcused = input.isExcused ?? false;
  const feedback = input.feedback?.trim().slice(0, 5000) || null;
  const reason = input.reason?.trim().slice(0, 300) || null;
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > item.maxScore)) {
    return fail(`La nota debe estar entre 0 y ${formatNumber(item.maxScore)}.`);
  }

  return db.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findFirst({
      where: { id: input.enrollmentId, institutionId: actor.institutionId, courseId: item.courseId, status: { in: [...GRADED_STATUSES] } },
      select: { id: true },
    });
    if (!enrollment) return fail("Esa persona no está inscrita en este curso.");
    const key = { gradeItemId: item.id, enrollmentId: enrollment.id };
    const existing = await tx.gradeEntry.findUnique({
      where: { gradeItemId_enrollmentId: key },
      select: { id: true, score: true, feedback: true, isExcused: true },
    });

    if (score === null && (!existing || existing.score === null)) {
      // Sin nota: solo se marca o se quita la exoneración.
      if (!isExcused) {
        if (!existing) return fail("Escribe la nota o marca «Exonerado».");
        await tx.gradeEntry.delete({ where: { id: existing.id } });
        return done("Se quitó la exoneración. La actividad quedó sin nota.");
      }
      const data = { isExcused: true, feedback, gradedById: actor.id, gradedAt: now };
      if (existing) await tx.gradeEntry.update({ where: { id: existing.id }, data });
      else await tx.gradeEntry.create({ data: { institutionId: actor.institutionId, ...key, score: null, ...data } });
      return done("Quedó exonerado: esta actividad no cuenta en su promedio.");
    }

    // Con nota. Si no se envía una nueva, se conserva la que había.
    const nextScore = score ?? existing!.score!;
    const hadScore = existing !== null && existing.score !== null;
    if (hadScore && existing?.score !== nextScore && !reason) {
      return fail("Ya había una nota. Escribe el motivo del cambio para guardarla.");
    }
    const written = await writeGradeEntry(
      tx,
      {
        institutionId: actor.institutionId,
        ...key,
        score: nextScore,
        feedback,
        actorId: actor.id,
        reason: reason ?? (existing && !hadScore ? "Primera nota después de estar exonerado" : null),
      },
      now,
    );
    if (!written.ok) return fail(written.message);
    if ((existing?.isExcused ?? false) !== isExcused) {
      await tx.gradeEntry.update({ where: { gradeItemId_enrollmentId: key }, data: { isExcused } });
    }
    if (isExcused) return done("Guardado. Quedó exonerado: esta actividad no cuenta en su promedio.");
    return done(written.changed || existing?.isExcused ? "Nota guardada." : "No había cambios que guardar.");
  });
}

// ---------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------

/** La tabla del docente como CSV para Excel. Null si no puede gestionar el curso. */
export async function gradebookCsv(actor: GradebookActor, courseId: string): Promise<{ filename: string; content: string } | null> {
  const book = await loadGradebook(actor, courseId);
  if (!book) return null;
  const header = ["Estudiante", "Correo", ...book.items.map((item) => `${item.title} (máx. ${formatNumber(item.maxScore)})`), "Promedio (0 a 100)"];
  const rows = book.students.map((student) => [
    student.name,
    student.email,
    ...book.items.map((item) => {
      const cell = student.cells[item.id];
      if (cell?.isExcused) return "Exonerado";
      return cell?.score ?? "";
    }),
    student.average ?? "",
  ]);
  const slug = (book.course.code ?? book.course.name).normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "curso";
  return { filename: `notas-${slug}.csv`, content: buildCsv([header, ...rows]) };
}

// ---------------------------------------------------------------------------------------
// Mis notas (estudiante)
// ---------------------------------------------------------------------------------------

export type MyGradeItem = { id: string; title: string; maxScore: number; score: number | null; isExcused: boolean; feedback: string | null };
export type MyGrades = {
  course: { id: string; name: string };
  average: number | null;
  groups: Array<{ id: string; name: string; weight: number; items: MyGradeItem[] }>;
  pending: Array<{ id: string; title: string; categoryName: string }>;
};

/**
 * Las notas publicadas de quien consulta, y solo las suyas. Exige ser estudiante con matrícula
 * activa o completada en ese curso de su institución; si no, null.
 */
export async function loadMyGrades(actor: GradebookActor, courseId: string): Promise<MyGrades | null> {
  if (actor.role !== "STUDENT" || !actor.institutionId || !courseId) return null;
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: actor.id, courseId, institutionId: actor.institutionId, status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId: actor.institutionId } },
    select: { id: true, course: { select: { id: true, name: true } } },
  });
  if (!enrollment) return null;
  const periods = await db.gradingPeriod.findMany({
    where: { institutionId: actor.institutionId, courseId },
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      weight: true,
      categories: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          weight: true,
          dropLowest: true,
          items: {
            where: { isPublished: true },
            orderBy: [{ dueDate: "asc" }, { title: "asc" }],
            select: {
              id: true,
              title: true,
              maxScore: true,
              weight: true,
              entries: { where: { enrollmentId: enrollment.id }, select: { score: true, isExcused: true, feedback: true } },
            },
          },
        },
      },
    },
  });

  const cells: Record<string, GradebookCell> = {};
  const groups: MyGrades["groups"] = [];
  const pending: MyGrades["pending"] = [];
  const severalPeriods = periods.length > 1;
  for (const period of periods) {
    for (const category of period.categories) {
      if (category.items.length === 0) continue;
      const name = severalPeriods ? `${period.name} · ${category.name}` : category.name;
      const items = category.items.map((item) => {
        const entry = item.entries[0];
        if (entry) cells[item.id] = { score: entry.score, isExcused: entry.isExcused, feedback: entry.feedback };
        const isExcused = entry?.isExcused ?? false;
        const score = entry?.score ?? null;
        if (score === null && !isExcused) pending.push({ id: item.id, title: item.title, categoryName: name });
        return { id: item.id, title: item.title, maxScore: item.maxScore, score, isExcused, feedback: entry?.feedback ?? null };
      });
      groups.push({ id: category.id, name, weight: category.weight, items });
    }
  }
  return { course: enrollment.course, average: averageFor(periods, cells), groups, pending };
}
