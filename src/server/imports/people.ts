import { z } from "zod";
import { parseCsv, toCsv } from "@/server/imports/csv";

export const MAX_IMPORT_ROWS = 5000;

export type ImportRole = "STUDENT" | "TEACHER" | "PARENT";
export type PersonRow = { line: number; name: string; email: string; role: ImportRole; phone: string | null };
export type RowError = { line: number; field: string; message: string; raw: string[] };
export type ParsedPeople = { header: string[]; rows: PersonRow[]; errors: RowError[]; totalLines: number };

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Nombres de columna aceptados, tal como llegan de Excel en español o inglés. */
const COLUMN_ALIASES: Record<"name" | "email" | "role" | "phone", string[]> = {
  name: ["nombre", "nombre completo", "nombres y apellidos", "estudiante", "name", "full name"],
  email: ["correo", "correo electronico", "email", "e-mail", "mail"],
  role: ["rol", "tipo", "role"],
  phone: ["telefono", "celular", "movil", "phone"],
};

const ROLE_ALIASES: Record<string, ImportRole> = {
  estudiante: "STUDENT",
  alumno: "STUDENT",
  alumna: "STUDENT",
  participante: "STUDENT",
  student: "STUDENT",
  docente: "TEACHER",
  profesor: "TEACHER",
  profesora: "TEACHER",
  instructor: "TEACHER",
  teacher: "TEACHER",
  tutor: "PARENT",
  tutora: "PARENT",
  padre: "PARENT",
  madre: "PARENT",
  parent: "PARENT",
};

const emailSchema = z.string().email().max(200);

export function mapColumns(header: string[]) {
  const normalized = header.map(normalize);
  const find = (key: keyof typeof COLUMN_ALIASES) => normalized.findIndex((cell) => COLUMN_ALIASES[key].includes(cell));
  return { name: find("name"), email: find("email"), role: find("role"), phone: find("phone") };
}

/**
 * Convierte el archivo en filas válidas y errores por línea, sin tocar la base de datos.
 * Los roles administrativos no se importan: solo estudiantes, docentes y tutores.
 */
export function parsePeopleCsv(content: string, defaultRole: ImportRole = "STUDENT"): ParsedPeople {
  const table = parseCsv(content);
  const header = table[0] ?? [];
  const columns = mapColumns(header);
  const rows: PersonRow[] = [];
  const errors: RowError[] = [];
  const fail = (line: number, field: string, message: string, raw: string[]) => errors.push({ line, field, message, raw });

  if (columns.name < 0 || columns.email < 0) {
    fail(1, "encabezado", 'El archivo necesita las columnas "Nombre" y "Correo" en la primera fila.', header);
    return { header, rows, errors, totalLines: Math.max(0, table.length - 1) };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    fail(1, "archivo", `El archivo tiene más de ${MAX_IMPORT_ROWS} filas. Divídelo en varios.`, header);
    return { header, rows, errors, totalLines: table.length - 1 };
  }

  const seen = new Map<string, number>();
  table.slice(1).forEach((raw, index) => {
    const line = index + 2;
    const cell = (position: number) => (position >= 0 ? (raw[position] ?? "").trim() : "");
    const name = cell(columns.name).replace(/\s+/g, " ");
    const email = cell(columns.email).toLowerCase();
    const roleText = normalize(cell(columns.role));
    const role = roleText ? ROLE_ALIASES[roleText] : defaultRole;
    const phone = cell(columns.phone) || null;

    if (name.length < 3 || name.length > 120) return fail(line, "Nombre", "Escribe el nombre completo (3 a 120 letras).", raw);
    if (!emailSchema.safeParse(email).success) return fail(line, "Correo", "El correo no es válido.", raw);
    if (!role) return fail(line, "Rol", "Usa Estudiante, Docente o Tutor.", raw);
    if (phone && phone.length > 40) return fail(line, "Teléfono", "El teléfono es demasiado largo.", raw);
    const firstLine = seen.get(email);
    if (firstLine) return fail(line, "Correo", `Este correo ya aparece en la fila ${firstLine}.`, raw);
    seen.set(email, line);
    rows.push({ line, name, email, role, phone });
  });
  return { header, rows, errors, totalLines: table.length - 1 };
}

/** Archivo descargable con las filas rechazadas, la fila original y el motivo. */
export function errorsToCsv(parsed: Pick<ParsedPeople, "header" | "errors">) {
  return toCsv([
    ["Fila", "Columna", "Problema", ...parsed.header],
    ...parsed.errors.map((error) => [String(error.line), error.field, error.message, ...error.raw]),
  ]);
}
