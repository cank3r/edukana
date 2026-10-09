import { auth } from "@/lib/auth";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  institutionSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  emails: z.array(z.string().trim().toLowerCase().email()).length(3),
  unitName: z.string().trim().min(3).max(120),
  courseName: z.string().trim().min(3).max(160),
  courseCode: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9._-]+$/),
});

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" },
});

export async function POST(request: Request) {
  const sessionUser = (await auth())?.user;
  if (!sessionUser?.id || !sessionUser.institutionId) return json({ error: "No autorizado" }, 401);

  const actor = await db.user.findFirst({
    where: { id: sessionUser.id, institutionId: sessionUser.institutionId, status: "ACTIVE" },
    select: { id: true, institutionId: true, role: true },
  });
  if (!actor) return json({ error: "La sesión ya no es válida" }, 401);

  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("tenant.settings.manage") || !capabilities.has("people.manage") || !capabilities.has("academic.structure.manage")) {
    return json({ error: "Permisos insuficientes" }, 403);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Preflight inválido" }, 400);
  const input = parsed.data;
  const emails = input.emails.map((email) => email.toLowerCase());

  const [institution, activePeriodCount, emailRows, unit, courseByName, courseByCode] = await Promise.all([
    db.institution.findFirst({
      where: { id: actor.institutionId, slug: input.institutionSlug },
      select: { id: true },
    }),
    db.academicPeriod.count({ where: { institutionId: actor.institutionId, isActive: true } }),
    db.user.findMany({
      where: { institutionId: actor.institutionId, email: { in: emails } },
      select: { email: true },
    }),
    db.organizationalUnit.findFirst({
      where: { institutionId: actor.institutionId, name: { equals: input.unitName, mode: "insensitive" } },
      select: { id: true },
    }),
    db.course.findFirst({
      where: { institutionId: actor.institutionId, name: input.courseName },
      select: { id: true },
    }),
    db.course.findFirst({
      where: { institutionId: actor.institutionId, code: input.courseCode.toUpperCase() },
      select: { id: true },
    }),
  ]);

  if (!institution) return json({ safe: false, reason: "institution_mismatch" }, 409);

  const conflicts = {
    emails: emailRows.map((row) => row.email).sort(),
    unitName: Boolean(unit),
    courseName: Boolean(courseByName),
    courseCode: Boolean(courseByCode),
  };
  const safe = activePeriodCount > 0
    && conflicts.emails.length === 0
    && !conflicts.unitName
    && !conflicts.courseName
    && !conflicts.courseCode;

  return json({ safe, activePeriodCount, conflicts }, safe ? 200 : 409);
}
