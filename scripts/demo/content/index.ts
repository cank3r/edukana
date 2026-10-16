import { CONTABILIDAD_BASICA, LEGISLACION_TRIBUTARIA, MATEMATICA_FINANCIERA } from "./contabilidad";
import { ANATOMIA, FUNDAMENTOS, PRIMEROS_AUXILIOS } from "./enfermeria";
import { EXCEL } from "./excel";
import type { GroupKey, TeacherKey } from "./people";
import { TECHNICAL_COURSES } from "./tecnicos";
import type { DemoCourse, DemoShortAnswer, ProgramKey } from "./types";

export * from "./admissions";
export * from "./people";
export * from "./types";

export const PROGRAMS: Record<ProgramKey, {
  name: string;
  description: string;
  monthlyFeeCents: number;
  enrollmentFeeCents: number;
  groups: Array<{ key: GroupKey; name: (year: number) => string; description: string }>;
}> = {
  ENF: {
    name: "Técnico en Enfermería",
    description: "Programa de dos años para trabajar en hospitales, clínicas y centros de atención primaria, con prácticas supervisadas.",
    monthlyFeeCents: 450000,
    enrollmentFeeCents: 250000,
    groups: [
      { key: "ENF-M", name: (year) => `Enfermería ${year} — Mañana`, description: "Tanda de la mañana, de lunes a viernes de 8:00 a 10:00 a. m." },
      { key: "ENF-T", name: (year) => `Enfermería ${year} — Tarde`, description: "Tanda de la tarde, de lunes a viernes de 2:00 a 4:00 p. m." },
    ],
  },
  CON: {
    name: "Técnico en Contabilidad",
    description: "Programa para llevar la contabilidad y los impuestos de pequeñas y medianas empresas.",
    monthlyFeeCents: 380000,
    enrollmentFeeCents: 200000,
    groups: [
      { key: "CON-N", name: (year) => `Contabilidad ${year} — Noche`, description: "Tanda de la noche, de lunes a viernes de 6:00 a 8:00 p. m." },
      { key: "CON-S", name: (year) => `Contabilidad ${year} — Sábados`, description: "Tanda de los sábados, de 8:00 a. m. a 1:00 p. m." },
    ],
  },
};

/**
 * Lo que se agrega a los siete cursos de siempre: una pregunta de respuesta corta en el examen (la revisa
 * el docente), un segundo día de clase cuando solo tenían uno (la asistencia se toma dos veces por semana)
 * y el docente nuevo de Fundamentos de Enfermería.
 */
const EXTRAS: Record<string, { shortAnswer: DemoShortAnswer; addSlot?: DemoCourse["schedule"][number]; teacher?: TeacherKey }> = {
  "ENF-101": {
    shortAnswer: {
      prompt: "Explica con tus palabras la diferencia entre arterias y venas.",
      answer: "Las arterias llevan la sangre desde el corazón hacia el cuerpo; las venas la devuelven al corazón.",
      explanation: "La dirección del flujo define cada vaso.",
      samples: [
        "Las arterias sacan la sangre del corazón con oxígeno hacia los órganos y las venas la regresan al corazón, con menos presión.",
        "Las arterias son más gruesas y las venas más finas.",
        "Las venas son azules y las arterias rojas.",
      ],
    },
  },
  "ENF-102": {
    teacher: "milagros",
    shortAnswer: {
      prompt: "¿En qué cinco momentos se debe hacer la higiene de manos según la OMS?",
      answer: "Antes del contacto con el paciente, antes de una tarea aséptica, después del riesgo de exposición a fluidos, después del contacto con el paciente y después del contacto con su entorno.",
      explanation: "Son los cinco momentos de la OMS.",
      samples: [
        "Antes de tocar al paciente, antes de un procedimiento limpio, después de tocar fluidos, después de tocar al paciente y después de tocar sus cosas.",
        "Antes y después de atender al paciente.",
        "Cuando las manos se ven sucias.",
      ],
    },
  },
  "ENF-103": {
    addSlot: { weekday: 3, start: 10 * 60, end: 12 * 60, room: "Salón de simulación" },
    shortAnswer: {
      prompt: "Describe los primeros pasos ante una persona que se desmaya en la calle.",
      answer: "Asegurar la escena, comprobar si responde y respira, llamar al 911 y, si no respira, iniciar RCP.",
      explanation: "Proteger, avisar y socorrer.",
      samples: [
        "Primero me aseguro de que no hay peligro, le hablo y le toco los hombros, miro si respira, llamo al 911 y si no respira empiezo compresiones.",
        "Llamo al 911 y espero.",
        "Le doy agua.",
      ],
    },
  },
  "CON-101": {
    shortAnswer: {
      prompt: "Explica qué es la partida doble con un ejemplo.",
      answer: "Cada operación se registra en dos cuentas con el mismo monto: una al debe y otra al haber.",
      explanation: "El debe y el haber siempre suman lo mismo.",
      samples: [
        "Toda operación afecta dos cuentas por el mismo valor. Si vendo RD$5,000 al contado: Debe Caja 5,000 / Haber Ventas 5,000.",
        "Es anotar todo dos veces.",
        "Es cuando el negocio tiene dos cuentas de banco.",
      ],
    },
  },
  "CON-102": {
    shortAnswer: {
      prompt: "¿Por qué el interés compuesto crece más rápido que el simple?",
      answer: "Porque en el compuesto los intereses de cada período se suman al capital y también generan intereses.",
      explanation: "Interés sobre interés.",
      samples: [
        "Porque los intereses se capitalizan: se suman al capital y el período siguiente se calculan sobre un monto mayor.",
        "Porque cobra más interés.",
        "Porque el banco lo decide así.",
      ],
    },
  },
  "CON-103": {
    addSlot: { weekday: 6, start: 9 * 60, end: 11 * 60, room: "Aula 205" },
    shortAnswer: {
      prompt: "¿Qué es el ITBIS y quién lo paga?",
      answer: "Es el impuesto a la transferencia de bienes y servicios; lo paga el consumidor final y lo cobra y declara el negocio.",
      explanation: "El negocio actúa como agente que cobra y declara.",
      samples: [
        "Es el impuesto del 18 % a los bienes y servicios. Lo paga quien compra y el negocio lo cobra y lo declara a la DGII cada mes.",
        "Es un impuesto que paga el negocio.",
        "Es el impuesto sobre la renta.",
      ],
    },
  },
  "EXC-100": {
    addSlot: { weekday: 3, start: 18 * 60, end: 20 * 60, room: "Laboratorio de Informática" },
    shortAnswer: {
      prompt: "¿Para qué sirve fijar una celda con el signo $ en una fórmula?",
      answer: "Para que la referencia no cambie al copiar la fórmula a otras celdas (referencia absoluta).",
      explanation: "La referencia absoluta mantiene fija la celda.",
      samples: [
        "Para que al copiar la fórmula hacia abajo siga usando la misma celda, por ejemplo la tasa del ITBIS en $F$1.",
        "Para que la celda salga en dólares.",
        "Para bloquear la hoja.",
      ],
    },
  },
};

function withExtras(course: DemoCourse): DemoCourse {
  const extra = EXTRAS[course.code];
  if (!extra) return course;
  return {
    ...course,
    teacher: extra.teacher ?? course.teacher,
    schedule: extra.addSlot ? [...course.schedule, extra.addSlot] : course.schedule,
    exam: { ...course.exam, shortAnswer: course.exam.shortAnswer ?? extra.shortAnswer },
  };
}

/** Los doce cursos, en el orden en que se crean. Tres tienen precio y salen en el catálogo público. */
export const COURSES: DemoCourse[] = [
  ANATOMIA,
  FUNDAMENTOS,
  PRIMEROS_AUXILIOS,
  CONTABILIDAD_BASICA,
  MATEMATICA_FINANCIERA,
  LEGISLACION_TRIBUTARIA,
  EXCEL,
  ...TECHNICAL_COURSES,
].map(withExtras);
