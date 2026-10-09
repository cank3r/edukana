/**
 * Semilla de demostración para el recorrido en navegador (`npm run test:smoke`).
 *
 * Crea «Instituto Demo» con un administrador, un docente y dos estudiantes, un curso publicado
 * con contenido, tarea, examen, clase en vivo, programa, grupo y un aviso. Deja los ids en
 * `smoke-artifacts/seed.json` para que el recorrido sepa a qué pantallas ir.
 *
 * Solo corre sobre una base local de pruebas recién migrada:
 *   EDUKANA_INTEGRATION_DB=1 node --require ./tests/integration/stub-server-only.cjs --import tsx tests/e2e/smoke/seed.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { addGroupCourses, addGroupMembers, createGroup } from "@/server/academic/groups";
import { addProgramCourses, createProgram } from "@/server/academic/programs";
import { saveAssignment } from "@/server/assessment/assignments";
import { createExam, setExamPublished } from "@/server/assessment/exam-admin";
import { setupSimpleGrading } from "@/server/assessment/gradebook";
import { createQuestion } from "@/server/assessment/question-bank";
import { createChapter, createLesson, setChapterPublished, setLessonPublished } from "@/server/courses/content";
import { createCourse, setCoursePublished } from "@/server/courses/course";
import { enrollStudents } from "@/server/courses/enrollment";
import { createLiveClasses } from "@/server/courses/live-classes";
import { createCharge, recordPayment } from "@/server/finance/charges";
import { SMOKE_ACCOUNTS, SMOKE_PASSWORD, SMOKE_SEED_FILE, type SmokeSeed } from "./shared";

const TIME_ZONE = "America/Santo_Domingo";

/** Día del calendario de la institución, `offset` días después de hoy, como AAAA-MM-DD. */
function dayKey(offset: number) {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function must<T extends { ok: boolean }>(step: string, result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`Semilla: falló «${step}»: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.EDUKANA_INTEGRATION_DB !== "1" || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("La semilla del recorrido solo corre con EDUKANA_INTEGRATION_DB=1 y una base local.");
  }
  if (await db.institution.count({ where: { slug: "instituto-demo" } })) {
    throw new Error("«Instituto Demo» ya existe. La semilla se carga una sola vez sobre una base recién migrada.");
  }

  const passwordHash = await bcrypt.hash(SMOKE_PASSWORD, 10);
  const institution = await db.institution.create({
    data: { name: "Instituto Demo", slug: "instituto-demo", type: "INSTITUTE", timezone: TIME_ZONE },
    select: { id: true },
  });
  const institutionId = institution.id;

  async function person(name: string, email: string, role: "ADMIN" | "TEACHER" | "STUDENT") {
    const identity = await db.identity.create({ data: { email, passwordHash }, select: { id: true } });
    const user = await db.user.create({
      data: { institutionId, identityId: identity.id, name, email, role, status: "ACTIVE", emailVerified: new Date() },
      select: { id: true },
    });
    return { id: user.id, institutionId, role };
  }
  const admin = await person("Carla Méndez", SMOKE_ACCOUNTS.admin, "ADMIN");
  const teacher = await person("Luis Peralta", SMOKE_ACCOUNTS.teacher, "TEACHER");
  const student1 = await person("Ana Rodríguez", SMOKE_ACCOUNTS.student1, "STUDENT");
  const student2 = await person("Pedro Jiménez", SMOKE_ACCOUNTS.student2, "STUDENT");

  const year = Number(dayKey(0).slice(0, 4));
  const period = await db.academicPeriod.create({
    data: { institutionId, name: `Año ${year}`, startDate: new Date(`${year}-01-01T00:00:00.000Z`), endDate: new Date(`${year + 1}-06-30T00:00:00.000Z`), isActive: true },
    select: { id: true },
  });

  // Curso del docente, publicado, con dos capítulos y cuatro lecciones.
  const teacherScope = { kind: "teacher", teacherId: teacher.id } as const;
  const course = must("crear curso", await createCourse(teacher, teacherScope, {
    name: "Matemática Básica",
    description: "Números, operaciones y problemas de la vida diaria.",
    teacherId: teacher.id,
    periodId: period.id,
    code: "MAT-101",
  }));
  const courseId = course.courseId;
  must("publicar curso", await setCoursePublished(teacher, teacherScope, courseId, true));

  const lessonIds: string[] = [];
  const chapters = [
    {
      title: "Unidad 1. Números naturales",
      description: "Contar, ordenar y comparar.",
      lessons: [
        { title: "Qué son los números naturales", summary: "Para qué sirven y cómo se escriben.", type: "TEXT", content: "Los números naturales son los que usamos para contar: 1, 2, 3…\n\nEn esta lección veremos cómo se leen y se ordenan.", estimatedMinutes: 10 },
        { title: "Video: contar de diez en diez", summary: "Mira el video y practica en tu cuaderno.", type: "VIDEO", content: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", estimatedMinutes: 8 },
      ],
    },
    {
      title: "Unidad 2. Suma y resta",
      description: "Operaciones básicas con ejemplos.",
      lessons: [
        { title: "Sumar con llevadas", summary: "Paso a paso.", type: "TEXT", content: "Para sumar con llevadas se empieza por las unidades.\n\nEjemplo: 27 + 15 = 42.", estimatedMinutes: 12 },
        { title: "Actividad: problemas del mercado", summary: "Resuelve tres problemas.", type: "ACTIVITY", content: "1. Compras 3 libras de arroz a 35 pesos cada una. ¿Cuánto pagas?\n2. Pagas con 200 pesos. ¿Cuánto te devuelven?\n3. Inventa un problema parecido.", estimatedMinutes: 15 },
      ],
    },
  ];
  for (const chapter of chapters) {
    const created = must(`capítulo ${chapter.title}`, await createChapter(teacher, courseId, { title: chapter.title, description: chapter.description }));
    const chapterId = created.id;
    if (!chapterId) throw new Error("Semilla: el capítulo no devolvió su id.");
    must("publicar capítulo", await setChapterPublished(teacher, chapterId, true));
    for (const lesson of chapter.lessons) {
      const made = must(`lección ${lesson.title}`, await createLesson(teacher, chapterId, lesson));
      if (!made.id) throw new Error("Semilla: la lección no devolvió su id.");
      must("publicar lección", await setLessonPublished(teacher, made.id, true));
      lessonIds.push(made.id);
    }
  }

  must("inscribir estudiantes", await enrollStudents(teacher, courseId, [student1.id, student2.id]));

  // Calificación sencilla: un período y la categoría «General».
  must("configuración de notas", await setupSimpleGrading(teacher, courseId));
  const category = await db.gradeCategory.findFirstOrThrow({ where: { institutionId, courseId }, select: { id: true } });

  const capabilities = await getEffectiveCapabilities(institutionId, "TEACHER");
  const assignment = must("tarea", await saveAssignment({ ...teacher, capabilities }, {
    courseId,
    title: "Problemas de suma y resta",
    instructions: "Resuelve los cinco problemas de la página 12 y escribe aquí tus respuestas con el procedimiento.",
    dueLocal: `${dayKey(7)}T18:00`,
    maxScore: 100,
    allowLate: true,
    categoryId: category.id,
    publish: true,
  }));

  const questionIds: string[] = [];
  const questions = [
    { type: "MULTIPLE_CHOICE", prompt: "¿Cuánto es 27 + 15?", options: ["32", "42", "52"], correctIndex: 1, points: 4 },
    { type: "TRUE_FALSE", prompt: "El número 10 es mayor que el 9.", answer: "Verdadero", points: 3 },
    { type: "SHORT_ANSWER", prompt: "Explica con tus palabras qué es una llevada.", answer: "Cuando la suma de una columna pasa de 9 y se lleva una decena a la siguiente.", points: 3 },
  ];
  for (const question of questions) {
    questionIds.push(must(`pregunta ${question.prompt}`, await createQuestion(teacher, courseId, question)).id);
  }
  const exam = must("examen", await createExam(teacher, courseId, {
    title: "Prueba corta: suma y resta",
    instructions: "Tienes 5 minutos. Lee cada pregunta con calma.",
    questions: questionIds.map((bankItemId, index) => ({ bankItemId, points: questions[index].points })),
    durationMinutes: 5,
    maxAttempts: 3,
    showReview: true,
    gradeCategoryId: category.id,
  }));
  must("publicar examen", await setExamPublished(teacher, exam.id, true));

  must("clase en vivo", await createLiveClasses(teacher, {
    courseId,
    title: "Repaso de la unidad 1",
    date: dayKey(1),
    time: "10:00",
    durationMinutes: 60,
    joinUrl: "https://meet.example.com/instituto-demo-matematica",
    description: "Traigan sus dudas de la unidad 1.",
  }));

  const program = must("programa", await createProgram(admin, { name: "Bachillerato Técnico", description: "Programa de dos años.", isPublished: true }));
  must("curso del programa", await addProgramCourses(admin, program.programId, [courseId]));
  const group = must("grupo", await createGroup(admin, { name: "Grupo A – Mañana", description: "Estudiantes del turno de la mañana.", programId: program.programId, startsOn: dayKey(0), capacity: "30" }));
  must("miembros del grupo", await addGroupMembers(admin, group.groupId, [student1.id, student2.id]));
  must("curso del grupo", await addGroupCourses(admin, group.groupId, [courseId]));

  const announcement = await db.announcement.create({
    data: {
      institutionId,
      authorId: admin.id,
      title: "Bienvenidos al nuevo período",
      content: "Las clases comienzan esta semana. Revisen su horario y sus cursos.",
      audienceInstitution: true,
      audience: "ALL",
    },
    select: { id: true },
  });

  // --- M5 · pagos y recibos ---
  // Un cargo por estudiante con un pago parcial, para recorrer el historial de pagos y los recibos.
  for (const student of [student1, student2]) {
    const charge = must("cargo de mensualidad", await createCharge(admin, { studentId: student.id, concept: "Mensualidad de prueba", amountCents: 350_000, dueDate: dayKey(10) }));
    must("pago de la mensualidad", await recordPayment(admin, { chargeId: charge.chargeId ?? "", amountCents: 100_000, paidOn: dayKey(0), method: "CASH", note: "Pago de prueba" }));
  }
  // --- fin M5 ---

  const seed: SmokeSeed = {
    institutionId,
    courseId,
    lessonIds,
    assignmentId: assignment.assignmentId,
    examId: exam.id,
    questionIds,
    programId: program.programId,
    groupId: group.groupId,
    announcementId: announcement.id,
    studentIds: [student1.id, student2.id],
  };
  mkdirSync(join(process.cwd(), "smoke-artifacts"), { recursive: true });
  writeFileSync(join(process.cwd(), SMOKE_SEED_FILE), JSON.stringify(seed, null, 2));
  console.log("Semilla del recorrido lista:", seed);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
