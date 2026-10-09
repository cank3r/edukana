/**
 * Personas del «Instituto Técnico Demo». Todos los correos usan el dominio reservado
 * `demo.edukana.do`: así `demo:remove` sabe qué cuentas creó la semilla y no toca ninguna otra.
 */

export const DEMO_EMAIL_DOMAIN = "demo.edukana.do";

const mail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`;

/** Cómo le va a cada estudiante: decide entregas, notas, asistencia, avance y pagos. */
export type StudentProfile = "destacado" | "regular" | "atrasado" | "en_riesgo";
export type StudentTrack = "ENF" | "CON" | "EXCEL";

export type DemoStaff = { key: string; name: string; email: string; phone: string };
export type DemoStudent = { name: string; email: string; phone: string; track: StudentTrack; profile: StudentProfile; alsoExcel?: boolean };
export type DemoGuardian = { name: string; email: string; phone: string; studentEmail: string; relationship: "MOTHER" | "FATHER" | "LEGAL_GUARDIAN" };

export const ADMIN: DemoStaff = { key: "admin", name: "Margarita Rosario Díaz", email: mail("directora"), phone: "809-555-0100" };
export const COORDINATOR: DemoStaff = { key: "coordinator", name: "Francisco Taveras Gil", email: mail("coordinacion"), phone: "809-555-0101" };

export const TEACHERS = {
  rosa: { key: "rosa", name: "Rosa Almonte Guzmán", email: mail("rosa.almonte"), phone: "829-555-0110" },
  julio: { key: "julio", name: "Julio César Ventura", email: mail("julio.ventura"), phone: "829-555-0111" },
  ramon: { key: "ramon", name: "Ramón Peña Castillo", email: mail("ramon.pena"), phone: "809-555-0112" },
  yokasta: { key: "yokasta", name: "Yokasta Féliz Matos", email: mail("yokasta.feliz"), phone: "849-555-0113" },
} satisfies Record<string, DemoStaff>;
export type TeacherKey = keyof typeof TEACHERS;

const s = (name: string, local: string, phone: string, track: StudentTrack, profile: StudentProfile, alsoExcel = false): DemoStudent => ({
  name,
  email: mail(local),
  phone,
  track,
  profile,
  ...(alsoExcel ? { alsoExcel } : {}),
});

/** 40 estudiantes: 18 de Enfermería (mañana), 16 de Contabilidad (noche) y 6 que solo toman Excel. */
export const STUDENTS: DemoStudent[] = [
  // Técnico en Enfermería — tanda de la mañana
  s("Ana Mercedes Reyes", "ana.reyes", "829-555-0201", "ENF", "destacado", true),
  s("Yulissa Rodríguez Peña", "yulissa.rodriguez", "809-555-0202", "ENF", "regular"),
  s("Wilkin Santana Mota", "wilkin.santana", "849-555-0203", "ENF", "atrasado"),
  s("Esmeralda Pujols Báez", "esmeralda.pujols", "829-555-0204", "ENF", "destacado"),
  s("Carolina Méndez Tejada", "carolina.mendez", "809-555-0205", "ENF", "regular"),
  s("Yaritza Mejía Lora", "yaritza.mejia", "829-555-0206", "ENF", "en_riesgo"),
  s("Starlin De los Santos", "starlin.delossantos", "849-555-0207", "ENF", "regular"),
  s("Paola Andrea Cabrera", "paola.cabrera", "809-555-0208", "ENF", "destacado", true),
  s("Rosanna Valdez Ureña", "rosanna.valdez", "829-555-0209", "ENF", "regular"),
  s("Joel Antonio Batista", "joel.batista", "809-555-0210", "ENF", "atrasado"),
  s("Nathalie Guerrero Polanco", "nathalie.guerrero", "849-555-0211", "ENF", "regular"),
  s("Daniela Sánchez Ogando", "daniela.sanchez", "829-555-0212", "ENF", "destacado"),
  s("Luz Marina Encarnación", "luz.encarnacion", "809-555-0213", "ENF", "regular"),
  s("Keila Familia Rosario", "keila.familia", "829-555-0214", "ENF", "en_riesgo"),
  s("Mariela Abreu Núñez", "mariela.abreu", "849-555-0215", "ENF", "regular", true),
  s("Brayan Ramírez Ozuna", "brayan.ramirez", "809-555-0216", "ENF", "atrasado"),
  s("Isamar Cuevas Herrera", "isamar.cuevas", "829-555-0217", "ENF", "destacado"),
  s("Yohanna Disla Vargas", "yohanna.disla", "809-555-0218", "ENF", "regular"),
  // Técnico en Contabilidad — tanda de la noche
  s("José Miguel Fernández", "jose.fernandez", "809-555-0301", "CON", "destacado", true),
  s("Ruth Esther Polanco", "ruth.polanco", "829-555-0302", "CON", "regular"),
  s("Franklin Medina Soto", "franklin.medina", "849-555-0303", "CON", "atrasado"),
  s("Marisol Jiménez Cruz", "marisol.jimenez", "809-555-0304", "CON", "destacado"),
  s("Edwin Alcántara Luna", "edwin.alcantara", "829-555-0305", "CON", "regular"),
  s("Rafael Antonio Guzmán", "rafael.guzman", "809-555-0306", "CON", "en_riesgo"),
  s("Leidy Laura Taveras", "leidy.taveras", "849-555-0307", "CON", "regular", true),
  s("Héctor Manuel Pimentel", "hector.pimentel", "829-555-0308", "CON", "regular"),
  s("Yesenia Brito Ramos", "yesenia.brito", "809-555-0309", "CON", "destacado"),
  s("Ángel Luis Morillo", "angel.morillo", "849-555-0310", "CON", "atrasado"),
  s("Claribel Tavárez Paulino", "claribel.tavarez", "829-555-0311", "CON", "regular"),
  s("Wander Castillo Feliz", "wander.castillo", "809-555-0312", "CON", "regular"),
  s("Gisela Moreno Antigua", "gisela.moreno", "829-555-0313", "CON", "destacado"),
  s("Kelvin Arias Matos", "kelvin.arias", "849-555-0314", "CON", "en_riesgo"),
  s("Sugeidy Peralta Hiciano", "sugeidy.peralta", "809-555-0315", "CON", "regular"),
  s("Robert Espinal Cepeda", "robert.espinal", "829-555-0316", "CON", "regular"),
  // Solo el curso de Excel
  s("Altagracia Henríquez Sosa", "altagracia.henriquez", "809-555-0401", "EXCEL", "destacado"),
  s("Manuel Emilio Rosario", "manuel.rosario", "829-555-0402", "EXCEL", "regular"),
  s("Indhira Vásquez Lantigua", "indhira.vasquez", "849-555-0403", "EXCEL", "regular"),
  s("Félix Antonio Germán", "felix.german", "809-555-0404", "EXCEL", "atrasado"),
  s("Wendy Marte Beltré", "wendy.marte", "829-555-0405", "EXCEL", "destacado"),
  s("Pedro Pablo Ogando", "pedro.ogando", "809-555-0406", "EXCEL", "regular"),
];

/** Seis madres, padres o tutores vinculados a un estudiante cada uno. */
export const GUARDIANS: DemoGuardian[] = [
  { name: "María Altagracia Reyes", email: mail("maria.reyes"), phone: "809-555-0501", studentEmail: mail("ana.reyes"), relationship: "MOTHER" },
  { name: "Ramón Santana Peguero", email: mail("ramon.santana"), phone: "829-555-0502", studentEmail: mail("wilkin.santana"), relationship: "FATHER" },
  { name: "Mercedes Mejía Lora", email: mail("mercedes.mejia"), phone: "849-555-0503", studentEmail: mail("yaritza.mejia"), relationship: "MOTHER" },
  { name: "Juana Batista Rosario", email: mail("juana.batista"), phone: "809-555-0504", studentEmail: mail("joel.batista"), relationship: "LEGAL_GUARDIAN" },
  { name: "Luis Manuel Guzmán", email: mail("luis.guzman"), phone: "829-555-0505", studentEmail: mail("rafael.guzman"), relationship: "FATHER" },
  { name: "Carmen Arias Matos", email: mail("carmen.arias"), phone: "809-555-0506", studentEmail: mail("kelvin.arias"), relationship: "MOTHER" },
];

/** Cinco solicitudes de admisión, cada una en una etapa distinta. */
export const LEADS = [
  {
    name: "Genesis Paulino Marte",
    email: mail("genesis.paulino"),
    phone: "829-555-0601",
    programInterest: "Técnico en Enfermería",
    source: "Instagram",
    notes: "Escribió por mensaje directo preguntando por la tanda de la mañana y las prácticas en hospitales.",
    stage: "INTERESTED",
  },
  {
    name: "Eddy Rafael Montero",
    email: mail("eddy.montero"),
    phone: "809-555-0602",
    programInterest: "Técnico en Contabilidad",
    source: "Referido por estudiante",
    notes: "Lo refirió José Miguel Fernández. Trabaja de día en un colmado; le interesa la tanda de la noche. Falta el récord de notas de bachillerato.",
    stage: "DOCUMENTS",
  },
  {
    name: "Arelis Contreras Vólquez",
    email: mail("arelis.contreras"),
    phone: "849-555-0603",
    programInterest: "Técnico en Enfermería",
    source: "Feria vocacional",
    notes: "Entregó copia de cédula, acta de nacimiento y certificado de bachiller. Pendiente la entrevista con coordinación.",
    stage: "REVIEW",
  },
  {
    name: "Luis Alberto Frías",
    email: mail("luis.frias"),
    phone: "829-555-0604",
    programInterest: "Técnico en Contabilidad",
    source: "Página web",
    notes: "Aprobó la entrevista. Se le explicó el pago de inscripción y empieza el próximo cuatrimestre.",
    stage: "ACCEPTED",
  },
  {
    name: "Yiraldy Cordero Silverio",
    email: mail("yiraldy.cordero"),
    phone: "809-555-0605",
    programInterest: "Técnico en Enfermería",
    source: "Llamada telefónica",
    notes: "Aún no termina el bachillerato.",
    stage: "REJECTED",
    reason: "Todavía no tiene el título de bachiller. Se le orientó sobre el programa PREPARA y puede volver a aplicar cuando lo termine.",
  },
] as const;
