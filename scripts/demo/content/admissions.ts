import { DEMO_EMAIL_DOMAIN, STUDENTS, type DemoStudent } from "./people";

/**
 * 25 solicitudes de admisión en todas las etapas. Las 6 «inscritas» son estudiantes que ya están en
 * la institución: llegaron por admisiones y se convirtieron en estudiantes al empezar el cuatrimestre.
 */
export type DemoLeadStage = "INTERESTED" | "DOCUMENTS" | "REVIEW" | "ACCEPTED" | "REJECTED" | "ENROLLED";
export type DemoLead = {
  name: string;
  email: string;
  phone: string;
  programInterest: string;
  source: string;
  notes: string;
  stage: DemoLeadStage;
  /** Hace cuántos días llegó la solicitud. */
  daysAgo: number;
  reason?: string;
  /** Solo en las inscritas: el estudiante en que se convirtió. */
  student?: DemoStudent;
};

const mail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`;
const lead = (name: string, local: string, phone: string, programInterest: string, source: string, stage: DemoLeadStage, daysAgo: number, notes: string, reason?: string): DemoLead => ({
  name,
  email: mail(local),
  phone,
  programInterest,
  source,
  stage,
  daysAgo,
  notes,
  ...(reason ? { reason } : {}),
});

const ENF = "Técnico en Enfermería";
const CON = "Técnico en Contabilidad";

const OPEN: DemoLead[] = [
  lead("Genesis Paulino Marte", "genesis.paulino", "829-555-0601", ENF, "Instagram", "INTERESTED", 2, "Escribió por mensaje directo preguntando por la tanda de la mañana y las prácticas en hospitales."),
  lead("Brenda Lisbeth Mateo", "brenda.mateo", "809-555-0607", "Informática", "Página web", "INTERESTED", 3, "Quiere saber si el curso de mantenimiento de computadoras tiene certificado."),
  lead("Yunior Alexander Peña", "yunior.pena", "849-555-0608", "Electricidad", "Feria vocacional", "INTERESTED", 5, "Trabaja como ayudante de electricista. Pregunta por horarios de fin de semana."),
  lead("Mabel Cristina Ortiz", "mabel.ortiz", "829-555-0609", "Turismo", "WhatsApp", "INTERESTED", 6, "Vive en Bávaro y quiere el curso de servicio al turista en línea."),
  lead("Darwin Encarnación Mejía", "darwin.encarnacion", "809-555-0610", CON, "Facebook", "INTERESTED", 9, "Preguntó por las facilidades de pago de la mensualidad."),
  lead("Rosmery Abreu Taveras", "rosmery.abreu", "849-555-0611", "Mercadeo", "Instagram", "INTERESTED", 12, "Tiene un emprendimiento de bizcochos y quiere aprender a vender por redes."),
  lead("Eddy Rafael Montero", "eddy.montero", "809-555-0602", CON, "Referido por estudiante", "DOCUMENTS", 15, "Lo refirió José Miguel Fernández. Trabaja de día en un colmado; le interesa la tanda de la noche. Falta el récord de notas de bachillerato."),
  lead("Yesenia Marlenis Cruz", "yesenia.cruz", "829-555-0612", ENF, "Página web", "DOCUMENTS", 18, "Entregó cédula y acta de nacimiento. Falta el certificado médico."),
  lead("Kelvin José Durán", "kelvin.duran", "849-555-0613", "Informática", "Feria vocacional", "DOCUMENTS", 20, "Falta la copia del título de bachiller."),
  lead("Nairobi Santos Frías", "nairobi.santos", "809-555-0614", ENF, "Llamada telefónica", "DOCUMENTS", 22, "Pidió la lista de documentos por correo. Va a traerlos el sábado."),
  lead("Raúl Antonio Ventura", "raul.ventura", "829-555-0615", "Electricidad", "Referido por docente", "DOCUMENTS", 25, "Referido por el profesor Domingo Severino."),
  lead("Arelis Contreras Vólquez", "arelis.contreras", "849-555-0603", ENF, "Feria vocacional", "REVIEW", 27, "Entregó copia de cédula, acta de nacimiento y certificado de bachiller. Pendiente la entrevista con coordinación."),
  lead("Gabriel Antonio Rosario", "gabriel.rosario", "809-555-0616", CON, "Página web", "REVIEW", 30, "Documentos completos. Entrevista agendada para el jueves a las 6:00 p. m."),
  lead("Lisbeth Carolina Núñez", "lisbeth.nunez", "829-555-0617", "Turismo", "Instagram", "REVIEW", 33, "Documentos completos. Habla inglés intermedio."),
  lead("Omar Ernesto Polanco", "omar.polanco", "849-555-0618", "Informática", "WhatsApp", "REVIEW", 35, "Documentos completos. Coordinación revisa su récord de notas."),
  lead("Luis Alberto Frías", "luis.frias", "829-555-0604", CON, "Página web", "ACCEPTED", 38, "Aprobó la entrevista. Se le explicó el pago de inscripción y empieza el próximo cuatrimestre."),
  lead("Crismeily Batista Reyes", "crismeily.batista", "809-555-0619", ENF, "Referido por estudiante", "ACCEPTED", 41, "Admitida para la tanda de la tarde. Pagará la inscripción la próxima semana."),
  lead("Anderson Mota Liriano", "anderson.mota", "849-555-0620", "Electricidad", "Feria vocacional", "ACCEPTED", 44, "Admitido. Espera el inicio del próximo grupo de Electricidad residencial."),
  lead(
    "Yiraldy Cordero Silverio", "yiraldy.cordero", "809-555-0605", ENF, "Llamada telefónica", "REJECTED", 47, "Aún no termina el bachillerato.",
    "Todavía no tiene el título de bachiller. Se le orientó sobre el programa PREPARA y puede volver a aplicar cuando lo termine.",
  ),
];

/** Seis estudiantes de las tandas de la tarde y de los sábados que llegaron por admisiones. */
function converted(): DemoLead[] {
  const pool = STUDENTS.filter((student) => student.group === "ENF-T" || student.group === "CON-S");
  const chosen = [0, 5, 11, 30, 37, 44].map((index) => pool[index]).filter(Boolean);
  const sources = ["Instagram", "Feria vocacional", "Referido por estudiante", "Página web", "Facebook", "Llamada telefónica"];
  return chosen.map((student, index) => ({
    name: student.name,
    email: student.email,
    phone: student.phone,
    programInterest: student.track === "ENF" ? ENF : CON,
    source: sources[index],
    stage: "ENROLLED" as const,
    daysAgo: 70 + index * 4,
    notes: "Completó documentos y entrevista. Se inscribió al empezar el cuatrimestre.",
    student,
  }));
}

export const LEADS: DemoLead[] = [...OPEN, ...converted()];
