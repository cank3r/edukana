/**
 * Personas del «Instituto Técnico Demo». Todos los correos usan el dominio reservado
 * `demo.edukana.do`: así `demo:remove` sabe qué cuentas creó la semilla y no toca ninguna otra.
 *
 * Los 40 estudiantes con nombre propio son los de siempre (algunos aparecen en la guía de la demo);
 * los otros 80 se arman con nombres y apellidos dominicanos comunes, siempre en el mismo orden,
 * así cada carga produce exactamente las mismas personas.
 */

export const DEMO_EMAIL_DOMAIN = "demo.edukana.do";

const mail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`;

/** Cómo le va a cada estudiante: decide entregas, notas, asistencia, avance y pagos. */
export type StudentProfile = "destacado" | "regular" | "atrasado" | "en_riesgo";
export type StudentTrack = "ENF" | "CON" | "EXCEL";
/** Grupo (tanda) del estudiante; los de «EXCEL» no pertenecen a ningún grupo. */
export type GroupKey = "ENF-M" | "ENF-T" | "CON-N" | "CON-S";
/** Cursos complementarios: cada estudiante de un grupo toma uno o dos. */
export const ELECTIVES = ["INF-101", "ELE-101", "ELE-102", "MER-101", "TUR-101", "EXC-100"] as const;
export type ElectiveCode = (typeof ELECTIVES)[number];

export type DemoStaff = { key: string; name: string; email: string; phone: string };
export type DemoStudent = {
  name: string;
  email: string;
  phone: string;
  track: StudentTrack;
  group: GroupKey | null;
  profile: StudentProfile;
  electives: ElectiveCode[];
};
export type DemoGuardian = { name: string; email: string; phone: string; studentEmail: string; relationship: "MOTHER" | "FATHER" | "LEGAL_GUARDIAN" };

export const ADMIN: DemoStaff = { key: "admin", name: "Margarita Rosario Díaz", email: mail("directora"), phone: "809-555-0100" };
export const COORDINATOR: DemoStaff = { key: "coordinator", name: "Francisco Taveras Gil", email: mail("coordinacion"), phone: "809-555-0101" };

export const TEACHERS = {
  rosa: { key: "rosa", name: "Rosa Almonte Guzmán", email: mail("rosa.almonte"), phone: "829-555-0110" },
  julio: { key: "julio", name: "Julio César Ventura", email: mail("julio.ventura"), phone: "829-555-0111" },
  ramon: { key: "ramon", name: "Ramón Peña Castillo", email: mail("ramon.pena"), phone: "809-555-0112" },
  yokasta: { key: "yokasta", name: "Yokasta Féliz Matos", email: mail("yokasta.feliz"), phone: "849-555-0113" },
  milagros: { key: "milagros", name: "Milagros Concepción Abreu", email: mail("milagros.concepcion"), phone: "809-555-0114" },
  victor: { key: "victor", name: "Víctor Manuel Liriano", email: mail("victor.liriano"), phone: "829-555-0115" },
  domingo: { key: "domingo", name: "Domingo Antonio Severino", email: mail("domingo.severino"), phone: "849-555-0116" },
  fausto: { key: "fausto", name: "Fausto Rafael Then", email: mail("fausto.then"), phone: "809-555-0117" },
  lissette: { key: "lissette", name: "Lissette Marte Cabral", email: mail("lissette.marte"), phone: "829-555-0118" },
  yahaira: { key: "yahaira", name: "Yahaira Nolasco Durán", email: mail("yahaira.nolasco"), phone: "809-555-0119" },
} satisfies Record<string, DemoStaff>;
export type TeacherKey = keyof typeof TEACHERS;

const named = (
  name: string,
  local: string,
  phone: string,
  track: StudentTrack,
  profile: StudentProfile,
  electives: ElectiveCode[] = [],
): Omit<DemoStudent, "group"> => ({ name, email: mail(local), phone, track, profile, electives });

/** Los 40 de siempre. Enfermería va a la tanda de la mañana y Contabilidad a la de la noche. */
const NAMED: Array<Omit<DemoStudent, "group">> = [
  named("Ana Mercedes Reyes", "ana.reyes", "829-555-0201", "ENF", "destacado", ["EXC-100"]),
  named("Yulissa Rodríguez Peña", "yulissa.rodriguez", "809-555-0202", "ENF", "regular"),
  named("Wilkin Santana Mota", "wilkin.santana", "849-555-0203", "ENF", "atrasado"),
  named("Esmeralda Pujols Báez", "esmeralda.pujols", "829-555-0204", "ENF", "destacado"),
  named("Carolina Méndez Tejada", "carolina.mendez", "809-555-0205", "ENF", "regular"),
  named("Yaritza Mejía Lora", "yaritza.mejia", "829-555-0206", "ENF", "en_riesgo"),
  named("Starlin De los Santos", "starlin.delossantos", "849-555-0207", "ENF", "regular"),
  named("Paola Andrea Cabrera", "paola.cabrera", "809-555-0208", "ENF", "destacado", ["EXC-100"]),
  named("Rosanna Valdez Ureña", "rosanna.valdez", "829-555-0209", "ENF", "regular"),
  named("Joel Antonio Batista", "joel.batista", "809-555-0210", "ENF", "atrasado"),
  named("Nathalie Guerrero Polanco", "nathalie.guerrero", "849-555-0211", "ENF", "regular"),
  named("Daniela Sánchez Ogando", "daniela.sanchez", "829-555-0212", "ENF", "destacado"),
  named("Luz Marina Encarnación", "luz.encarnacion", "809-555-0213", "ENF", "regular"),
  named("Keila Familia Rosario", "keila.familia", "829-555-0214", "ENF", "en_riesgo"),
  named("Mariela Abreu Núñez", "mariela.abreu", "849-555-0215", "ENF", "regular", ["EXC-100"]),
  named("Brayan Ramírez Ozuna", "brayan.ramirez", "809-555-0216", "ENF", "atrasado"),
  named("Isamar Cuevas Herrera", "isamar.cuevas", "829-555-0217", "ENF", "destacado"),
  named("Yohanna Disla Vargas", "yohanna.disla", "809-555-0218", "ENF", "regular"),
  named("José Miguel Fernández", "jose.fernandez", "809-555-0301", "CON", "destacado", ["EXC-100"]),
  named("Ruth Esther Polanco", "ruth.polanco", "829-555-0302", "CON", "regular"),
  named("Franklin Medina Soto", "franklin.medina", "849-555-0303", "CON", "atrasado"),
  named("Marisol Jiménez Cruz", "marisol.jimenez", "809-555-0304", "CON", "destacado"),
  named("Edwin Alcántara Luna", "edwin.alcantara", "829-555-0305", "CON", "regular"),
  named("Rafael Antonio Guzmán", "rafael.guzman", "809-555-0306", "CON", "en_riesgo"),
  named("Leidy Laura Taveras", "leidy.taveras", "849-555-0307", "CON", "regular", ["EXC-100"]),
  named("Héctor Manuel Pimentel", "hector.pimentel", "829-555-0308", "CON", "regular"),
  named("Yesenia Brito Ramos", "yesenia.brito", "809-555-0309", "CON", "destacado"),
  named("Ángel Luis Morillo", "angel.morillo", "849-555-0310", "CON", "atrasado"),
  named("Claribel Tavárez Paulino", "claribel.tavarez", "829-555-0311", "CON", "regular"),
  named("Wander Castillo Feliz", "wander.castillo", "809-555-0312", "CON", "regular"),
  named("Gisela Moreno Antigua", "gisela.moreno", "829-555-0313", "CON", "destacado"),
  named("Kelvin Arias Matos", "kelvin.arias", "849-555-0314", "CON", "en_riesgo"),
  named("Sugeidy Peralta Hiciano", "sugeidy.peralta", "809-555-0315", "CON", "regular"),
  named("Robert Espinal Cepeda", "robert.espinal", "829-555-0316", "CON", "regular"),
  // Solo el curso de Excel (público externo).
  named("Altagracia Henríquez Sosa", "altagracia.henriquez", "809-555-0401", "EXCEL", "destacado", ["EXC-100"]),
  named("Manuel Emilio Rosario", "manuel.rosario", "829-555-0402", "EXCEL", "regular", ["EXC-100"]),
  named("Indhira Vásquez Lantigua", "indhira.vasquez", "849-555-0403", "EXCEL", "regular", ["EXC-100"]),
  named("Félix Antonio Germán", "felix.german", "809-555-0404", "EXCEL", "atrasado", ["EXC-100"]),
  named("Wendy Marte Beltré", "wendy.marte", "829-555-0405", "EXCEL", "destacado", ["EXC-100"]),
  named("Pedro Pablo Ogando", "pedro.ogando", "809-555-0406", "EXCEL", "regular", ["EXC-100"]),
];

const FEMALE = [
  "Yanelis", "Rosmery", "Arelis", "Yudelka", "Massiel", "Nicol", "Dahiana", "Yeimy", "Ambar", "Crismeily",
  "Yomaira", "Lisbeth", "Glenny", "Darling", "Yoselin", "Mabel", "Katherine", "Scarlet", "Yamilet", "Nairoby",
  "Elizabeth", "Paola", "Cristal", "Anyelina", "Rosalía", "Fiordaliza", "Belkis", "Yinette", "Mildred", "Johanna",
  "Leonela", "Marleny", "Aurelina", "Yesica", "Wanda", "Dilenia", "Carmen Rosa", "Esther", "Patria", "Juana",
];
const MALE = [
  "Yeison", "Anderson", "Wilmer", "Yunior", "Elvin", "Danilo", "Ramón Emilio", "Luis Alberto", "Juan Carlos", "Eddy",
  "Jhonatan", "Kelvin", "Raúl", "Omar", "Darwin", "Manuel", "Yeremi", "Franklin", "Euclides", "Nelson",
  "Bladimir", "Cristian", "Johan", "Rafael", "Pedro Julio", "Ismael", "Leonel", "Henry", "Starling", "José Luis",
  "Wilson", "Rubén", "Alexis", "Frailin", "Yordy", "Elías", "Moisés", "Ariel", "Gabriel", "Domingo",
];
const SURNAMES = [
  "Pérez", "Martínez", "De la Cruz", "Almonte", "Mota", "Peralta", "Then", "Ureña", "Vásquez", "Liriano",
  "Tejada", "Paulino", "Severino", "Nolasco", "Báez", "Castillo", "Gómez", "Hernández", "Jiménez", "Lantigua",
  "Marte", "Núñez", "Ozuna", "Pichardo", "Quezada", "Rosario", "Sosa", "Toribio", "Ventura", "Acosta",
  "Bautista", "Cabral", "Durán", "Espaillat", "Frías", "García", "Hidalgo", "Infante", "Javier", "Lora",
  "Mercedes", "Ogando", "Pujols", "Reynoso", "Santos", "Tavárez", "Valdez", "Zapata", "Agramonte", "Beltré",
  "Cuello", "Encarnación", "Florentino", "Guerrero", "Herrera", "Inoa", "Jáquez", "Luciano", "Medina", "Polanco",
];

/** Letras sin tildes ni espacios para la parte local del correo. */
const ascii = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, "");

/**
 * 80 estudiantes más: 12 para Enfermería mañana, 28 para Enfermería tarde, 14 para Contabilidad noche y
 * 26 para Contabilidad sábados. El perfil se reparte con una secuencia fija.
 */
function generated(): Array<Omit<DemoStudent, "group"> & { group: GroupKey }> {
  const plan: Array<[GroupKey, number]> = [["ENF-M", 12], ["ENF-T", 28], ["CON-N", 14], ["CON-S", 26]];
  // 5 en riesgo, 9 atrasados, 22 destacados y el resto regulares, intercalados.
  const profiles: StudentProfile[] = [];
  for (let index = 0; index < 80; index += 1) {
    profiles.push(index % 16 === 7 ? "en_riesgo" : index % 9 === 4 ? "atrasado" : index % 4 === 1 ? "destacado" : "regular");
  }
  const used = new Set([
    ...NAMED.map((student) => student.email),
    ADMIN.email,
    COORDINATOR.email,
    ...Object.values(TEACHERS).map((teacher) => teacher.email),
    ...GUARDIANS.map((guardian) => guardian.email),
  ]);
  const rows: Array<Omit<DemoStudent, "group"> & { group: GroupKey }> = [];
  let index = 0;
  for (const [group, count] of plan) {
    for (let n = 0; n < count; n += 1, index += 1) {
      const female = index % 5 !== 1 && index % 5 !== 3;
      const first = female ? FEMALE[(index * 7) % FEMALE.length] : MALE[(index * 11) % MALE.length];
      const last1 = SURNAMES[(index * 13 + 5) % SURNAMES.length];
      let last2 = SURNAMES[(index * 29 + 41) % SURNAMES.length];
      if (last2 === last1) last2 = SURNAMES[(index * 29 + 42) % SURNAMES.length];
      let local = `${ascii(first.split(" ")[0])}.${ascii(last1)}`;
      for (let suffix = 2; used.has(mail(local)); suffix += 1) local = `${ascii(first.split(" ")[0])}.${ascii(last1)}${suffix}`;
      used.add(mail(local));
      const area = ["809", "829", "849"][index % 3];
      const electives: ElectiveCode[] = [ELECTIVES[index % 5]];
      if (index % 3 === 0) electives.push(ELECTIVES[(index + 2) % 5]);
      rows.push({
        name: `${first} ${last1} ${last2}`,
        email: mail(local),
        phone: `${area}-555-${String(1000 + index).padStart(4, "0")}`,
        track: group.startsWith("ENF") ? "ENF" : "CON",
        group,
        profile: profiles[index],
        electives,
      });
    }
  }
  return rows;
}

/** Quince madres, padres o tutores vinculados a un estudiante cada uno. */
export const GUARDIANS: DemoGuardian[] = [
  { name: "María Altagracia Reyes", email: mail("maria.reyes"), phone: "809-555-0501", studentEmail: mail("ana.reyes"), relationship: "MOTHER" },
  { name: "Ramón Santana Peguero", email: mail("ramon.santana"), phone: "829-555-0502", studentEmail: mail("wilkin.santana"), relationship: "FATHER" },
  { name: "Mercedes Mejía Lora", email: mail("mercedes.mejia"), phone: "849-555-0503", studentEmail: mail("yaritza.mejia"), relationship: "MOTHER" },
  { name: "Juana Batista Rosario", email: mail("juana.batista"), phone: "809-555-0504", studentEmail: mail("joel.batista"), relationship: "LEGAL_GUARDIAN" },
  { name: "Luis Manuel Guzmán", email: mail("luis.guzman"), phone: "829-555-0505", studentEmail: mail("rafael.guzman"), relationship: "FATHER" },
  { name: "Carmen Arias Matos", email: mail("carmen.arias"), phone: "809-555-0506", studentEmail: mail("kelvin.arias"), relationship: "MOTHER" },
  { name: "Ana Julia Familia", email: mail("anajulia.familia"), phone: "849-555-0507", studentEmail: mail("keila.familia"), relationship: "MOTHER" },
  { name: "Pedro Ramírez Ozuna", email: mail("pedro.ramirez"), phone: "809-555-0508", studentEmail: mail("brayan.ramirez"), relationship: "FATHER" },
  { name: "Teresa Medina Soto", email: mail("teresa.medina"), phone: "829-555-0509", studentEmail: mail("franklin.medina"), relationship: "MOTHER" },
  { name: "Rafaela Morillo Díaz", email: mail("rafaela.morillo"), phone: "849-555-0510", studentEmail: mail("angel.morillo"), relationship: "MOTHER" },
  { name: "Bienvenido Pujols Báez", email: mail("bienvenido.pujols"), phone: "809-555-0511", studentEmail: mail("esmeralda.pujols"), relationship: "FATHER" },
  { name: "Dulce María Cuevas", email: mail("dulce.cuevas"), phone: "829-555-0512", studentEmail: mail("isamar.cuevas"), relationship: "MOTHER" },
  { name: "Andrés Jiménez Cruz", email: mail("andres.jimenez"), phone: "849-555-0513", studentEmail: mail("marisol.jimenez"), relationship: "FATHER" },
  { name: "Ramona Brito de Ramos", email: mail("ramona.brito"), phone: "809-555-0514", studentEmail: mail("yesenia.brito"), relationship: "MOTHER" },
  { name: "Altagracia Disla Vargas", email: mail("altagracia.disla"), phone: "829-555-0515", studentEmail: mail("yohanna.disla"), relationship: "LEGAL_GUARDIAN" },
];

/** Complementarios de los 34 de siempre que están en un grupo (además de Excel si ya lo tenían). */
const NAMED_ELECTIVES: Record<string, ElectiveCode[]> = {
  [mail("ana.reyes")]: ["TUR-101"],
  [mail("yaritza.mejia")]: ["INF-101"],
  [mail("jose.fernandez")]: ["MER-101"],
};

/** 120 estudiantes: 30 + 28 en Enfermería, 30 + 26 en Contabilidad y 6 que solo toman Excel. */
export const STUDENTS: DemoStudent[] = [
  ...NAMED.map((student, index): DemoStudent => {
    const group: GroupKey | null = student.track === "ENF" ? "ENF-M" : student.track === "CON" ? "CON-N" : null;
    const extra = NAMED_ELECTIVES[student.email] ?? (group ? [ELECTIVES[index % 5]] : []);
    return { ...student, group, electives: [...new Set([...student.electives, ...extra])] };
  }),
  ...generated(),
];
