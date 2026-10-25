import { Prisma, type AdmissionStage } from "@prisma/client";
import { z } from "zod";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { zonedParts, zonedTimeToUtc } from "@/lib/timezone";
import { normalizeEmail } from "@/server/identity";
import { createPerson } from "@/server/people/create";
import type { EdukanaRole } from "@/types/next-auth";

export type AdmissionActor = { id: string; institutionId: string; role: EdukanaRole };
export type AdmissionFailure = { ok: false; message: string; code?: "PERSON_EXISTS" };
export type AdmissionResult<T = object> = ({ ok: true } & T) | AdmissionFailure;

/** Orden del tablero. `REJECTED` («No continúa») queda al final y fuera del camino normal. */
export const STAGE_ORDER: readonly AdmissionStage[] = ["INTERESTED", "DOCUMENTS", "REVIEW", "ACCEPTED", "ENROLLED", "REJECTED"];
export const OPEN_STAGES: readonly AdmissionStage[] = ["INTERESTED", "DOCUMENTS", "REVIEW", "ACCEPTED"];

const ENTITY = "AdmissionLead";
const NOT_FOUND = "No encontramos esa solicitud. Puede que alguien la haya borrado; vuelve a la lista.";
const NO_PERMISSION = "No tienes permiso para gestionar las solicitudes de admisión.";
const ALREADY_STUDENT = "Esta solicitud ya se convirtió en estudiante y no se puede cambiar de etapa.";
// El bloqueo de fila (FOR UPDATE) ordena las operaciones simultáneas; READ COMMITTED basta y evita reintentos.
const rowLocked = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

const fail = (message: string): AdmissionFailure => ({ ok: false, message });

export const leadSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo (al menos 3 letras).").max(120, "El nombre es demasiado largo."),
  email: z
    .string()
    .max(254, "El correo es demasiado largo.")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Escribe un correo válido, por ejemplo ana@correo.com."),
  phone: z.string().trim().max(30, "El teléfono es demasiado largo.").optional(),
  programInterest: z.string().trim().max(120, "El programa de interés es demasiado largo.").optional(),
  source: z.string().trim().max(60, "El origen es demasiado largo.").optional(),
  notes: z.string().trim().max(2000, "Las notas son demasiado largas (máximo 2000 letras).").optional(),
});

export type LeadInput = { name: string; email: string; phone?: string; programInterest?: string; source?: string; notes?: string };

function readLead(input: LeadInput) {
  const parsed = leadSchema.safeParse({ ...input, email: normalizeEmail(String(input.email ?? "")) });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const value = parsed.data;
  return {
    ok: true as const,
    data: {
      name: value.name,
      email: value.email,
      phone: value.phone || null,
      programInterest: value.programInterest || null,
      source: value.source || null,
      notes: value.notes || null,
    },
  };
}

async function can(actor: AdmissionActor, ...needed: Array<"admissions.manage" | "people.manage">) {
  if (!actor?.id || !actor.institutionId) return false;
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  return needed.every((capability) => capabilities.has(capability));
}

/** Persona creada a partir de la solicitud; se guarda dentro de `documents` porque el modelo no tiene un campo propio. */
export function convertedUserId(documents: unknown): string | null {
  if (!documents || typeof documents !== "object" || Array.isArray(documents)) return null;
  const value = (documents as Record<string, unknown>).convertedUserId;
  return typeof value === "string" && value ? value : null;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/** Solicitudes de la institución, las más recientes primero. Busca por nombre o correo y filtra por programa. */
export function listLeads(institutionId: string, filters: { search?: string; program?: string } = {}) {
  const q = (filters.search ?? "").trim().slice(0, 100);
  const program = (filters.program ?? "").trim().slice(0, 120);
  return db.admissionLead.findMany({
    where: {
      institutionId,
      ...(program ? { programInterest: { equals: program, mode: "insensitive" as const } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 500,
    select: { id: true, name: true, email: true, programInterest: true, source: true, stage: true, createdAt: true },
  });
}

/** Programas escritos en las solicitudes, para el filtro. */
export async function listLeadPrograms(institutionId: string) {
  const rows = await db.admissionLead.findMany({
    where: { institutionId, programInterest: { not: null } },
    distinct: ["programInterest"],
    orderBy: { programInterest: "asc" },
    take: 200,
    select: { programInterest: true },
  });
  return rows.map((row) => row.programInterest).filter((value): value is string => Boolean(value));
}

/**
 * Indicadores de arriba: solicitudes abiertas, admitidas este mes (según el historial) y
 * cuántas de cada 100 solicitudes terminaron inscritas.
 */
export async function admissionSummary(institutionId: string, timeZone: string, now = new Date()) {
  const parts = zonedParts(now, timeZone);
  const monthStart =
    zonedTimeToUtc(`${parts.year}-${String(parts.month).padStart(2, "0")}-01`, "00:00", timeZone) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [byStage, changes] = await Promise.all([
    db.admissionLead.groupBy({ by: ["stage"], where: { institutionId }, _count: { _all: true } }),
    db.auditLog.findMany({
      where: { institutionId, entity: ENTITY, action: "ADMISSION_STAGE_CHANGED", createdAt: { gte: monthStart } },
      select: { entityId: true, changes: true },
      take: 5000,
    }),
  ]);
  const count = (stage: AdmissionStage) => byStage.find((row) => row.stage === stage)?._count._all ?? 0;
  const total = byStage.reduce((sum, row) => sum + row._count._all, 0);
  const admitted = new Set(
    changes.filter((row) => (row.changes as { to?: unknown } | null)?.to === "ACCEPTED").map((row) => row.entityId),
  );
  return {
    total,
    open: OPEN_STAGES.reduce((sum, stage) => sum + count(stage), 0),
    admittedThisMonth: admitted.size,
    enrolled: count("ENROLLED"),
    conversionRate: total ? Math.round((count("ENROLLED") / total) * 100) : null,
  };
}

/** Una solicitud con su historial. Devuelve null si no es de la institución. */
export async function getLead(institutionId: string, leadId: string) {
  const lead = await db.admissionLead.findFirst({ where: { id: leadId, institutionId } });
  if (!lead) return null;
  const history = await db.auditLog.findMany({
    where: { institutionId, entity: ENTITY, entityId: lead.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { id: true, action: true, changes: true, createdAt: true, userId: true },
  });
  const authorIds = [...new Set(history.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
  const personId = convertedUserId(lead.documents);
  const [authors, person, sameEmail] = await Promise.all([
    authorIds.length ? db.user.findMany({ where: { id: { in: authorIds }, institutionId }, select: { id: true, name: true } }) : [],
    personId ? db.user.findFirst({ where: { id: personId, institutionId }, select: { id: true, name: true, email: true } }) : null,
    personId ? null : db.user.findFirst({ where: { institutionId, email: lead.email }, select: { id: true, name: true, role: true, status: true } }),
  ]);
  const names = new Map(authors.map((author) => [author.id, author.name]));
  return {
    lead,
    convertedUserId: personId,
    person,
    /** Persona de la institución que ya usa el correo de la solicitud (solo si aún no se convirtió). */
    sameEmail,
    history: history.map((row) => ({ id: row.id, action: row.action, changes: row.changes, createdAt: row.createdAt, author: row.userId ? names.get(row.userId) ?? null : null })),
  };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export async function createLead(actor: AdmissionActor, input: LeadInput): Promise<AdmissionResult<{ leadId: string }>> {
  if (!(await can(actor, "admissions.manage"))) return fail(NO_PERMISSION);
  const read = readLead(input);
  if (!read.ok) return read;
  return db.$transaction(async (tx) => {
    const lead = await tx.admissionLead.create({ data: { ...read.data, institutionId: actor.institutionId }, select: { id: true } });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "ADMISSION_CREATED", entity: ENTITY, entityId: lead.id, changes: { stage: "INTERESTED", source: read.data.source } },
    });
    return { ok: true, leadId: lead.id } as const;
  });
}

export async function updateLead(actor: AdmissionActor, leadId: string, input: LeadInput): Promise<AdmissionResult> {
  if (!(await can(actor, "admissions.manage"))) return fail(NO_PERMISSION);
  const read = readLead(input);
  if (!read.ok) return read;
  const data = read.data;
  return db.$transaction(async (tx) => {
    const lead = await tx.admissionLead.findFirst({ where: { id: leadId, institutionId: actor.institutionId } });
    if (!lead) return fail(NOT_FOUND);
    if (convertedUserId(lead.documents) && data.email !== lead.email) {
      return fail("Esta solicitud ya se convirtió en estudiante. Para cambiar su correo, corrígelo en la ficha de la persona.");
    }
    const fields = (Object.keys(data) as Array<keyof typeof data>).filter((key) => (lead[key] ?? null) !== data[key]);
    if (fields.length === 0) return { ok: true } as const;
    await tx.admissionLead.update({ where: { id: lead.id }, data });
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "ADMISSION_UPDATED", entity: ENTITY, entityId: lead.id, changes: { fields } },
    });
    return { ok: true } as const;
  });
}

/**
 * Mueve la solicitud a otra etapa (adelante o atrás) y deja el cambio en el historial.
 * «No continúa» exige un motivo. «Inscrito» solo se alcanza al convertir en estudiante.
 */
export async function moveLeadStage(actor: AdmissionActor, leadId: string, to: string, reason = ""): Promise<AdmissionResult<{ from: AdmissionStage; to: AdmissionStage }>> {
  if (!(await can(actor, "admissions.manage"))) return fail(NO_PERMISSION);
  if (!STAGE_ORDER.includes(to as AdmissionStage)) return fail("Elige una etapa de la lista.");
  const target = to as AdmissionStage;
  const why = reason.trim().slice(0, 500);
  if (target === "ENROLLED") return fail("Para dejarla como inscrita usa «Convertir en estudiante»: así se crea la persona en la institución.");
  if (target === "REJECTED" && why.length < 3) return fail("Escribe el motivo por el que no continúa.");
  return db.$transaction(async (tx) => {
    const lead = await tx.admissionLead.findFirst({ where: { id: leadId, institutionId: actor.institutionId }, select: { id: true, stage: true, documents: true } });
    if (!lead) return fail(NOT_FOUND);
    if (convertedUserId(lead.documents) || lead.stage === "ENROLLED") return fail(ALREADY_STUDENT);
    if (lead.stage === target) return { ok: true, from: lead.stage, to: target } as const;
    // La etapa anterior va en la condición: si otra persona la movió a la vez, este cambio no pisa el suyo.
    const moved = await tx.admissionLead.updateMany({ where: { id: lead.id, institutionId: actor.institutionId, stage: lead.stage }, data: { stage: target } });
    if (moved.count === 0) return fail("Alguien más acaba de mover esta solicitud. Actualiza la página y revisa en qué etapa quedó.");
    await tx.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        userId: actor.id,
        action: "ADMISSION_STAGE_CHANGED",
        entity: ENTITY,
        entityId: lead.id,
        changes: { from: lead.stage, to: target, ...(why ? { reason: why } : {}) },
      },
    });
    return { ok: true, from: lead.stage, to: target } as const;
  });
}

/** Borra la solicitud. Una solicitud convertida en estudiante no se borra: es el rastro de cómo llegó esa persona. */
export async function deleteLead(actor: AdmissionActor, leadId: string): Promise<AdmissionResult> {
  if (!(await can(actor, "admissions.manage"))) return fail(NO_PERMISSION);
  return db.$transaction(async (tx) => {
    const lead = await tx.admissionLead.findFirst({ where: { id: leadId, institutionId: actor.institutionId }, select: { id: true, name: true, stage: true, documents: true } });
    if (!lead) return fail(NOT_FOUND);
    if (convertedUserId(lead.documents) || lead.stage === "ENROLLED") {
      return fail("Esta solicitud ya se convirtió en estudiante y no se puede borrar. La persona se gestiona desde Personas.");
    }
    const removed = await tx.admissionLead.deleteMany({ where: { id: lead.id, institutionId: actor.institutionId, stage: { not: "ENROLLED" } } });
    if (removed.count === 0) return fail(NOT_FOUND);
    await tx.auditLog.create({
      data: { institutionId: actor.institutionId, userId: actor.id, action: "ADMISSION_DELETED", entity: ENTITY, entityId: lead.id, changes: { name: lead.name, stage: lead.stage } },
    });
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// Convertir en estudiante
// ---------------------------------------------------------------------------

export type ConvertInput = { leadId: string; groupId?: string; linkExisting?: boolean };
export type ConvertResult = AdmissionResult<{
  userId: string;
  /** true si la persona se creó ahora; false si se vinculó una que ya existía. */
  created: boolean;
  /** true si la solicitud ya estaba convertida: no se hizo nada. */
  alreadyConverted: boolean;
  addedToGroup: boolean;
  /** Aviso cuando la persona quedó inscrita pero no entró al grupo elegido. */
  groupNote: string | null;
}>;

const ROLE_WORDS: Record<string, string> = { STUDENT: "estudiante", TEACHER: "docente", COORDINATOR: "coordinador", PARENT: "tutor", ADMIN: "administrador", SUPER_ADMIN: "administrador" };
/** Margen para reconocer como propia a una persona que otra pulsación del mismo botón acaba de crear. */
const DOUBLE_CLICK_MS = 60_000;

/**
 * Convierte una solicitud admitida en estudiante: crea la persona (o vincula la que ya usa ese correo),
 * opcionalmente la agrega a un grupo y deja la solicitud como inscrita con el vínculo guardado.
 *
 * - Repetirlo no duplica nada: una solicitud ya convertida devuelve la misma persona.
 * - Si el correo ya es de alguien de la institución no falla: devuelve `PERSON_EXISTS` y,
 *   con `linkExisting`, vincula a esa persona si es estudiante activa.
 * - Si el grupo elegido se llenó o desapareció en el último momento, la persona queda inscrita
 *   sin grupo y se avisa en `groupNote`.
 */
export async function convertLead(actor: AdmissionActor, input: ConvertInput): Promise<ConvertResult> {
  if (!(await can(actor, "admissions.manage"))) return fail(NO_PERMISSION);
  if (!(await can(actor, "people.manage"))) {
    return fail("Convertir en estudiante crea una persona en la institución. Solo puede hacerlo quien gestiona personas; pídeselo a un administrador.");
  }
  const institutionId = actor.institutionId;
  const groupId = (input.groupId ?? "").trim() || null;

  const lead = await db.admissionLead.findFirst({ where: { id: input.leadId, institutionId } });
  if (!lead) return fail(NOT_FOUND);
  const done = convertedUserId(lead.documents);
  if (done) return { ok: true, userId: done, created: false, alreadyConverted: true, addedToGroup: false, groupNote: null };
  if (lead.stage !== "ACCEPTED" && lead.stage !== "ENROLLED") return fail("Solo se puede convertir en estudiante una solicitud admitida. Pásala primero a «Admitido».");

  if (groupId) {
    const group = await db.studentGroup.findFirst({ where: { id: groupId, institutionId }, select: { capacity: true, _count: { select: { members: true } } } });
    if (!group) return fail("Ese grupo ya no existe. Elige otro o convierte sin grupo.");
    if (group.capacity !== null && group._count.members >= group.capacity) return fail("Ese grupo está lleno: no quedan cupos. Elige otro grupo o convierte sin grupo.");
  }

  const email = normalizeEmail(lead.email);
  const findPerson = () => db.user.findFirst({ where: { institutionId, email }, select: { id: true, name: true, role: true, status: true, createdAt: true } });
  let person = await findPerson();
  let created = false;
  let confirmed = Boolean(input.linkExisting);
  if (!person) {
    const result = await createPerson(actor, { name: lead.name, email, role: "STUDENT", phone: lead.phone ?? undefined });
    if (result.ok) {
      created = true;
      person = await findPerson();
    } else {
      person = await findPerson();
      if (!person) return fail(result.message);
      // Doble clic: la otra pulsación creó a esta misma persona hace un instante; se sigue con ella.
      confirmed ||= person.role === "STUDENT" && Date.now() - person.createdAt.getTime() < DOUBLE_CLICK_MS;
    }
  }
  if (!person) return fail("No se pudo crear a la persona. Intenta de nuevo.");
  if (!created) {
    if (person.role !== "STUDENT") {
      return fail(`Ese correo ya es de ${person.name}, que está en la institución como ${ROLE_WORDS[person.role] ?? "otro rol"}. No se puede vincular como estudiante: corrige el correo de la solicitud o revisa a esa persona en Personas.`);
    }
    if (person.status !== "ACTIVE") {
      return fail(`Ese correo ya es de ${person.name}, que tiene el acceso suspendido. Reactívala en Personas y vuelve a intentarlo.`);
    }
    if (!confirmed) {
      return { ok: false, code: "PERSON_EXISTS", message: `Ya hay una estudiante o un estudiante con ese correo en tu institución: ${person.name}. Puedes vincular esta solicitud con esa persona en vez de crear otra.` };
    }
  }
  const userId = person.id;

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "admission_leads" WHERE "id" = ${lead.id} AND "institutionId" = ${institutionId} FOR UPDATE`;
    if (!locked.length) return fail(NOT_FOUND);
    const current = await tx.admissionLead.findFirst({ where: { id: lead.id, institutionId }, select: { stage: true, documents: true, notes: true } });
    if (!current) return fail(NOT_FOUND);
    const already = convertedUserId(current.documents);
    if (already) return { ok: true, userId: already, created: false, alreadyConverted: true, addedToGroup: false, groupNote: null } as const;
    if (current.stage !== "ACCEPTED" && current.stage !== "ENROLLED") return fail("Alguien más acaba de mover esta solicitud. Actualiza la página y revisa en qué etapa quedó.");

    let addedToGroup = false;
    let groupNote: string | null = null;
    if (groupId) {
      const groups = await tx.$queryRaw<Array<{ id: string; capacity: number | null }>>`
        SELECT "id", "capacity" FROM "student_groups" WHERE "id" = ${groupId} AND "institutionId" = ${institutionId} FOR UPDATE`;
      const members = groups.length ? await tx.studentGroupMember.findMany({ where: { groupId }, select: { userId: true } }) : [];
      if (!groups.length) {
        groupNote = "El grupo elegido ya no existe; la persona quedó inscrita sin grupo. Agrégala a un grupo desde Grupos.";
      } else if (members.some((member) => member.userId === userId)) {
        addedToGroup = true;
      } else if (groups[0].capacity !== null && members.length >= groups[0].capacity) {
        groupNote = "El grupo elegido se llenó; la persona quedó inscrita sin grupo. Agrégala a otro grupo desde Grupos.";
      } else {
        await tx.studentGroupMember.create({ data: { institutionId, groupId, userId } });
        await tx.auditLog.create({
          data: { institutionId, userId: actor.id, action: "GROUP_MEMBERS_ADDED", entity: "StudentGroup", entityId: groupId, changes: { count: 1, userIds: [userId] } },
        });
        addedToGroup = true;
      }
    }

    const previous = current.documents && typeof current.documents === "object" && !Array.isArray(current.documents) ? (current.documents as Prisma.JsonObject) : {};
    const stamp = new Date();
    const note = `Convertida en estudiante el ${stamp.toISOString().slice(0, 10)}${created ? "" : " (vinculada con una persona que ya existía)"}.`;
    await tx.admissionLead.update({
      where: { id: lead.id },
      data: {
        stage: "ENROLLED",
        documents: { ...previous, convertedUserId: userId, convertedAt: stamp.toISOString() } as unknown as Prisma.InputJsonObject,
        notes: [current.notes, note].filter(Boolean).join("\n").slice(0, 4000),
      },
    });
    await tx.auditLog.create({
      data: {
        institutionId,
        userId: actor.id,
        action: "ADMISSION_CONVERTED",
        entity: ENTITY,
        entityId: lead.id,
        changes: { from: current.stage, to: "ENROLLED", userId, created, groupId: addedToGroup ? groupId : null },
      },
    });
    return { ok: true, userId, created, alreadyConverted: false, addedToGroup, groupNote } as const;
  }, rowLocked);
}
