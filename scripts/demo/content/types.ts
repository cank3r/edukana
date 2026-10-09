import type { TeacherKey } from "./people";

export type DemoLesson = {
  title: string;
  summary: string;
  type: "TEXT" | "VIDEO" | "ACTIVITY" | "DOCUMENT";
  /** Texto de la lección; en VIDEO, solo el enlace del video. */
  content: string;
  minutes: number;
  /** Se deja como borrador para que el docente vea cómo se prepara una lección antes de publicarla. */
  draft?: boolean;
};

export type DemoChapter = { title: string; description: string; lessons: DemoLesson[] };

export type DemoQuestion =
  | { type: "MULTIPLE_CHOICE"; prompt: string; options: string[]; correctIndex: number; explanation: string }
  | { type: "TRUE_FALSE"; prompt: string; answer: "Verdadero" | "Falso"; explanation: string };

export type DemoAssignment = {
  title: string;
  instructions: string;
  maxScore: number;
  /** Respuestas de ejemplo que entregan los estudiantes. */
  answers: string[];
};

export type DemoCourse = {
  code: string;
  name: string;
  description: string;
  teacher: TeacherKey;
  program: "ENF" | "CON" | null;
  maxStudents: number;
  /** Bloques del horario semanal: día 1 = lunes … 7 = domingo; minutos desde las 00:00. */
  schedule: Array<{ weekday: number; start: number; end: number; room: string }>;
  chapters: DemoChapter[];
  /** La primera vence en el pasado (con entregas y notas); la segunda vence en los próximos días. */
  assignments: [DemoAssignment, DemoAssignment];
  exam: { title: string; instructions: string; questions: DemoQuestion[] };
  liveClass: { title: string; description: string; time: string; durationMinutes: number; daysFromToday: number; weeks: number };
  /** Si tiene precio, el curso aparece en el catálogo público. */
  catalogPriceCents?: number;
};

/** Une párrafos con una línea en blanco, que es como se muestran en la lección. */
export const paragraphs = (...parts: string[]) => parts.join("\n\n");
