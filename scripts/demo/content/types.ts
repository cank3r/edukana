import type { TeacherKey } from "./people";

export type ProgramKey = "ENF" | "CON";

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

/** Pregunta de respuesta corta: no se califica sola; el docente la revisa. */
export type DemoShortAnswer = {
  prompt: string;
  /** Respuesta esperada (la ve el docente al revisar). */
  answer: string;
  explanation: string;
  /** Respuestas de ejemplo que escriben los estudiantes, de la mejor a la más floja. */
  samples: [string, string, string];
};

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
  program: ProgramKey | null;
  maxStudents: number;
  /** Bloques del horario semanal: día 1 = lunes … 7 = domingo; minutos desde las 00:00. La asistencia se toma esos días. */
  schedule: Array<{ weekday: number; start: number; end: number; room: string }>;
  chapters: DemoChapter[];
  /**
   * Dos tareas escritas a mano: la primera es la práctica principal de la semana 5 y la segunda la que vence
   * en los próximos días. Las demás tareas semanales salen de los títulos de las lecciones.
   */
  assignments: [DemoAssignment, DemoAssignment];
  exam: { title: string; instructions: string; questions: DemoQuestion[]; shortAnswer?: DemoShortAnswer };
  liveClass: { title: string; description: string; time: string; durationMinutes: number; daysFromToday: number; weeks: number };
  /** Si tiene precio, el curso aparece en el catálogo público. */
  catalogPriceCents?: number;
};

/** Une párrafos con una línea en blanco, que es como se muestran en la lección. */
export const paragraphs = (...parts: string[]) => parts.join("\n\n");
