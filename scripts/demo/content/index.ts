import { CONTABILIDAD_BASICA, LEGISLACION_TRIBUTARIA, MATEMATICA_FINANCIERA } from "./contabilidad";
import { ANATOMIA, FUNDAMENTOS, PRIMEROS_AUXILIOS } from "./enfermeria";
import { EXCEL } from "./excel";
import type { DemoCourse } from "./types";

export * from "./people";
export * from "./types";

export const PROGRAMS = {
  ENF: {
    name: "Técnico en Enfermería",
    description: "Programa de dos años para trabajar en hospitales, clínicas y centros de atención primaria, con prácticas supervisadas.",
    groupName: (year: number) => `Enfermería ${year} — Mañana`,
    groupDescription: "Estudiantes de la tanda de la mañana, de lunes a viernes de 8:00 a 10:00 a. m.",
    monthlyFeeCents: 450000,
  },
  CON: {
    name: "Técnico en Contabilidad",
    description: "Programa para llevar la contabilidad y los impuestos de pequeñas y medianas empresas.",
    groupName: (year: number) => `Contabilidad ${year} — Noche`,
    groupDescription: "Estudiantes de la tanda de la noche, de lunes a viernes de 6:00 a 8:00 p. m.",
    monthlyFeeCents: 380000,
  },
} as const;

/** Los siete cursos, en el orden en que se crean. */
export const COURSES: DemoCourse[] = [ANATOMIA, FUNDAMENTOS, PRIMEROS_AUXILIOS, CONTABILIDAD_BASICA, MATEMATICA_FINANCIERA, LEGISLACION_TRIBUTARIA, EXCEL];
