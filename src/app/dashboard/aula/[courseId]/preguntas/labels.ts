export type QuestionKind = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";

export const QUESTION_TYPE_LABEL: Record<QuestionKind, string> = {
  MULTIPLE_CHOICE: "Selección múltiple",
  TRUE_FALSE: "Verdadero o falso",
  SHORT_ANSWER: "Respuesta corta",
};

export const QUESTION_TYPE_HELP: Record<QuestionKind, string> = {
  MULTIPLE_CHOICE: "El estudiante elige una entre varias opciones. Se califica sola.",
  TRUE_FALSE: "El estudiante marca Verdadero o Falso. Se califica sola.",
  SHORT_ANSWER: "El estudiante escribe su respuesta. La revisas y le pones los puntos tú.",
};

export const formatPoints = (points: number) => `${Number(points.toFixed(2))} ${points === 1 ? "punto" : "puntos"}`;
