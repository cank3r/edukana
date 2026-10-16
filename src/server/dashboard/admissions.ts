import "server-only";

import { db } from "@/lib/db";
import type { BoardContext } from "./context";

/**
 * Embudo de admisiones de la ventana: solicitudes que llegaron en ella y hasta dónde llegaron hoy.
 * «En proceso»: con documentos, en revisión o ya admitidas sin inscribir. «Inscritas»: convertidas en estudiante.
 * Consultas: 2 en paralelo (agrupado por etapa y conteo de la ventana anterior).
 */
export type AdmissionsFunnel = { received: number; inProcess: number; enrolled: number; rejected: number; waiting: number; receivedBefore: number | null };

export async function getAdmissionsFunnel(ctx: BoardContext): Promise<AdmissionsFunnel | null> {
  if (!ctx.can.admissions) return null;
  const { range } = ctx;
  const [stages, before] = await Promise.all([
    db.admissionLead.groupBy({
      by: ["stage"],
      where: { institutionId: ctx.institutionId, createdAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
    range.previous ? db.admissionLead.count({ where: { institutionId: ctx.institutionId, createdAt: { gte: range.previous.from, lt: range.previous.to } } }) : null,
  ]);
  const count = (...names: string[]) => stages.filter((row) => names.includes(row.stage)).reduce((sum, row) => sum + row._count._all, 0);
  return {
    received: count("INTERESTED", "DOCUMENTS", "REVIEW", "ACCEPTED", "ENROLLED", "REJECTED"),
    waiting: count("INTERESTED"),
    inProcess: count("DOCUMENTS", "REVIEW", "ACCEPTED"),
    enrolled: count("ENROLLED"),
    rejected: count("REJECTED"),
    receivedBefore: before,
  };
}
