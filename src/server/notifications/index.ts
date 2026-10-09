import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEmailProvider, type EmailProvider } from "@/server/integrations/email";
import { isEmailKind, shouldSendEmail } from "./email-policy";

/**
 * Notificaciones en la aplicación y por correo.
 *
 * - `notify` guarda una fila por persona. Solo llega a personas ACTIVAS de la misma institución:
 *   un id suspendido o de otra institución se descarta en silencio.
 * - `deliverEmails` envía el correo FUERA de cualquier transacción y nunca lanza: un correo que
 *   falla queda en el registro y la notificación sigue en la aplicación.
 * - El correo solo sale si la preferencia de la persona para ese tipo lo permite
 *   (ver `email-policy.ts`; sin preferencia guardada vale el valor por omisión del tipo).
 * - Máximo `EMAIL_BATCH` correos por llamada, para no alargar la respuesta de quien hizo la
 *   acción. Los destinatarios que pasen de ese tope reciben la notificación SOLO en la aplicación.
 */

export const EMAIL_BATCH = 50;
/** Cuántos correos salen a la vez dentro de un lote. */
const EMAIL_PARALLEL = 10;
export const PAGE_SIZE = 30;
const MAX_MARK = 200;

export type NotificationKind =
  | "announcement"
  | "assignment"
  | "submission"
  | "grade"
  | "exam"
  | "live_class"
  | "certificate"
  | "enrollment"
  | "charge";

export type NotifyInput = {
  institutionId: string;
  userIds: readonly string[];
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Ruta interna, por ejemplo `/dashboard/aula/abc/tareas/xyz`. Una dirección externa se descarta. */
  href?: string | null;
  /**
   * `false`: nunca por correo (por ejemplo, un aviso para demasiadas personas).
   * Si no se indica, va por correo a quien lo tenga activado en sus preferencias (solo a los primeros `EMAIL_BATCH`).
   */
  email?: boolean;
};

export type EmailRequest = { institutionId: string; userIds: string[]; kind: NotificationKind; title: string; body: string | null; href: string | null };
export type NotifyOutcome = { created: number; userIds: string[]; email: EmailRequest | null };
export type EmailOutcome = { sent: number; failed: number; skipped: number };

type NotifyClient = Pick<Prisma.TransactionClient, "notification" | "user">;
type SavepointClient = NotifyClient & Pick<Prisma.TransactionClient, "$executeRawUnsafe">;
export type NotificationViewer = { id: string; institutionId: string };

const clean = (value: string | null | undefined, max: number) => {
  const text = value?.trim() ?? "";
  return text ? text.slice(0, max) : null;
};

/** Solo rutas de la propia aplicación: «/dashboard/...». Nada de `//otro-sitio` ni `https://`. */
export function safeHref(href: string | null | undefined): string | null {
  const value = href?.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value.slice(0, 500);
}

const empty: NotifyOutcome = { created: 0, userIds: [], email: null };

/**
 * Crea las notificaciones en un solo `createMany`. Con `client = tx` queda dentro de la
 * transacción de quien llama; con `db`, va sola. Devuelve a quién llegó y, salvo `email: false`,
 * lo necesario para `deliverEmails` (que se llama después de confirmar la transacción y aplica
 * las preferencias de cada persona).
 */
export async function notify(client: NotifyClient, input: NotifyInput): Promise<NotifyOutcome> {
  const ids = [...new Set(input.userIds.filter((id) => typeof id === "string" && id))];
  const title = clean(input.title, 200);
  if (!input.institutionId || !ids.length || !title) return empty;
  const recipients = await client.user.findMany({
    where: { id: { in: ids }, institutionId: input.institutionId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!recipients.length) return empty;
  const userIds = recipients.map((user) => user.id);
  const body = clean(input.body, 1000);
  const href = safeHref(input.href);
  const created = await client.notification.createMany({
    data: userIds.map((userId) => ({ institutionId: input.institutionId, userId, kind: input.kind, title, body, href })),
  });
  return {
    created: created.count,
    userIds,
    email: input.email === false ? null : { institutionId: input.institutionId, userIds, kind: input.kind, title, body, href },
  };
}

export const PREFERENCES_PATH = "/dashboard/notificaciones/preferencias";

/**
 * De `userIds`, quienes quieren este tipo por correo según su preferencia guardada
 * (o el valor por omisión del tipo si no han elegido). Solo mira filas de la institución.
 */
export async function emailRecipients(institutionId: string, kind: string, userIds: readonly string[]): Promise<string[]> {
  // Un tipo que nunca va por correo no necesita consultar preferencias.
  if (!userIds.length || !isEmailKind(kind)) return [];
  const saved = await db.notificationPreference.findMany({
    where: { institutionId, kind, userId: { in: [...userIds] } },
    select: { userId: true, email: true },
  });
  const choice = new Map(saved.map((row) => [row.userId, row.email]));
  return userIds.filter((userId) => shouldSendEmail({ kind, preference: choice.get(userId) }));
}

function appBaseUrl(): string | null {
  const value = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  return value ? value.replace(/\/$/, "") : null;
}

function emailText(person: { name: string; institution: string }, request: EmailRequest) {
  const base = appBaseUrl();
  const lines = [`Hola, ${person.name}:`, "", request.title];
  if (request.body) lines.push("", request.body);
  if (base && request.href) lines.push("", "Ábrelo en Edukana:", `${base}${request.href}`);
  else lines.push("", "Entra a Edukana para verlo.");
  lines.push("", `Recibes este correo porque eres parte de ${person.institution} en Edukana.`);
  lines.push(base ? `Para elegir qué correos recibes: ${base}${PREFERENCES_PATH}` : "Puedes elegir qué correos recibes en Notificaciones › Elegir qué me llega por correo.");
  return lines.join("\n");
}

/**
 * Envía por correo lo que `notify` guardó. Va FUERA de la transacción y nunca lanza.
 * Solo a quien lo tiene activado en sus preferencias, a personas activas de la institución,
 * con cuenta activa, y a lo sumo `EMAIL_BATCH` por llamada: el resto (`skipped`) ya tiene
 * la notificación en la aplicación.
 * Si el correo no está configurado, se registra y no se envía nada.
 */
export async function deliverEmails(request: EmailRequest | null | undefined): Promise<EmailOutcome> {
  if (!request?.userIds.length) return { sent: 0, failed: 0, skipped: 0 };
  try {
    const wanted = await emailRecipients(request.institutionId, request.kind, [...new Set(request.userIds)]);
    const ids = wanted.slice(0, EMAIL_BATCH);
    if (!ids.length) return { sent: 0, failed: 0, skipped: request.userIds.length };
    const people = await db.user.findMany({
      where: {
        id: { in: ids },
        institutionId: request.institutionId,
        status: "ACTIVE",
        OR: [{ identityId: null }, { identity: { status: "ACTIVE" } }],
      },
      select: { id: true, name: true, email: true, institution: { select: { name: true } } },
    });
    const outcome: EmailOutcome = { sent: 0, failed: 0, skipped: request.userIds.length - people.length };
    if (!people.length) return outcome;
    let provider: EmailProvider;
    try {
      provider = getEmailProvider();
    } catch (error) {
      // Sin datos personales en el registro: solo cuántos correos no salieron y de qué tipo.
      console.warn("deliverEmails: correo no configurado; las notificaciones quedan solo en la aplicación", { kind: request.kind, count: people.length, error: String(error) });
      return { ...outcome, failed: people.length };
    }
    for (let start = 0; start < people.length; start += EMAIL_PARALLEL) {
      const chunk = people.slice(start, start + EMAIL_PARALLEL);
      const results = await Promise.allSettled(
        chunk.map((person) =>
          provider.send({
            to: person.email,
            subject: `${person.institution.name}: ${request.title}`.slice(0, 250),
            text: emailText({ name: person.name, institution: person.institution.name }, request),
          }),
        ),
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled") outcome.sent += 1;
        else {
          outcome.failed += 1;
          console.error("deliverEmails: no se pudo enviar", { correlationId: crypto.randomUUID(), kind: request.kind, userId: chunk[index].id, error: String(result.reason) });
        }
      });
    }
    return outcome;
  } catch (error) {
    console.error("deliverEmails failed", { correlationId: crypto.randomUUID(), error });
    return { sent: 0, failed: request.userIds.length, skipped: 0 };
  }
}

/**
 * `notify` + `deliverEmails` después de que la acción principal ya quedó guardada.
 * Nunca lanza: si algo falla se registra y la acción sigue su curso.
 */
export async function notifySafely(input: NotifyInput): Promise<NotifyOutcome> {
  try {
    const outcome = await notify(db, input);
    if (outcome.email) await deliverEmails(outcome.email);
    return outcome;
  } catch (error) {
    console.error("notifySafely failed", { correlationId: crypto.randomUUID(), kind: input.kind, error });
    return empty;
  }
}

/**
 * `notify` dentro de una transacción abierta, protegido con un punto de guardado de PostgreSQL:
 * si guardar las notificaciones falla, se deshace solo esa parte y la transacción de quien
 * llama sigue viva. El correo NO sale desde la transacción: `outcome.email` se entrega a
 * `deliverEmails` después de confirmarla (si la transacción se deshace, no se envía nada).
 */
export async function notifyWithinTransaction(tx: SavepointClient, input: NotifyInput): Promise<NotifyOutcome> {
  return (await withSavepoint(tx, input.kind, () => notify(tx, input))) ?? empty;
}

/**
 * Corre `work` dentro de un punto de guardado de la transacción `tx`. Si falla, se deshace solo
 * lo que hizo `work`, se registra y devuelve null; la transacción de quien llama sigue viva.
 */
export async function withSavepoint<T>(tx: Pick<Prisma.TransactionClient, "$executeRawUnsafe">, label: string, work: () => Promise<T>): Promise<T | null> {
  try {
    await tx.$executeRawUnsafe("SAVEPOINT edukana_notify");
  } catch (error) {
    console.error("notificación: sin punto de guardado", { correlationId: crypto.randomUUID(), label, error });
    return null;
  }
  try {
    const result = await work();
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT edukana_notify");
    return result;
  } catch (error) {
    console.error("notificación dentro de la transacción falló", { correlationId: crypto.randomUUID(), label, error });
    try {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT edukana_notify");
      await tx.$executeRawUnsafe("RELEASE SAVEPOINT edukana_notify");
    } catch (rollbackError) {
      console.error("notificación: no se pudo deshacer el punto de guardado", { correlationId: crypto.randomUUID(), error: rollbackError });
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lectura: cada persona ve y marca solo las suyas
// ---------------------------------------------------------------------------

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const itemSelect = { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true } as const;

/** Las más recientes primero, de `PAGE_SIZE` en `PAGE_SIZE`. `cursor` es el id de la última que se mostró. */
export async function listNotifications(viewer: NotificationViewer, { cursor }: { cursor?: string | null } = {}): Promise<{ items: NotificationItem[]; nextCursor: string | null }> {
  if (!viewer.id || !viewer.institutionId) return { items: [], nextCursor: null };
  const mine = { userId: viewer.id, institutionId: viewer.institutionId };
  let after: Prisma.NotificationWhereInput = {};
  if (cursor) {
    const last = await db.notification.findFirst({ where: { ...mine, id: cursor }, select: { id: true, createdAt: true } });
    // Un cursor ajeno o inexistente no da pistas: se vuelve a la primera página.
    if (last) after = { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] };
  }
  const rows = await db.notification.findMany({
    where: { ...mine, ...after },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: itemSelect,
  });
  const items = rows.slice(0, PAGE_SIZE);
  return { items, nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null };
}

/** Consulta barata (índice por persona y leída): sirve para la campana en cada página. */
export function countUnread(viewer: NotificationViewer): Promise<number> {
  if (!viewer.id || !viewer.institutionId) return Promise.resolve(0);
  return db.notification.count({ where: { userId: viewer.id, institutionId: viewer.institutionId, readAt: null } });
}

/** Marca como leídas las indicadas (o todas). Nunca toca las de otra persona. Devuelve cuántas cambió. */
export async function markRead(viewer: NotificationViewer, ids: readonly string[] | "all", now = new Date()): Promise<number> {
  if (!viewer.id || !viewer.institutionId) return 0;
  let only: Prisma.NotificationWhereInput = {};
  if (ids !== "all") {
    const list = [...new Set(ids.filter((id) => typeof id === "string" && id))].slice(0, MAX_MARK);
    if (!list.length) return 0;
    only = { id: { in: list } };
  }
  const result = await db.notification.updateMany({
    where: { userId: viewer.id, institutionId: viewer.institutionId, readAt: null, ...only },
    data: { readAt: now },
  });
  return result.count;
}

/** Una notificación propia, para abrirla: la marca leída y devuelve a dónde ir. */
export async function openNotification(viewer: NotificationViewer, id: string, now = new Date()): Promise<string | null> {
  if (!viewer.id || !viewer.institutionId || !id) return null;
  const item = await db.notification.findFirst({
    where: { id, userId: viewer.id, institutionId: viewer.institutionId },
    select: { id: true, href: true, readAt: true },
  });
  if (!item) return null;
  if (!item.readAt) await markRead(viewer, [item.id], now);
  return safeHref(item.href);
}

// ---------------------------------------------------------------------------
// Agrupar por día (código puro, en la zona horaria de la institución)
// ---------------------------------------------------------------------------

function dayKey(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** «Hoy», «Ayer» o «martes, 14 de octubre», en el orden en que llegan las notificaciones. */
export function groupByDay<T extends { createdAt: Date }>(items: readonly T[], timeZone: string, now = new Date()) {
  const today = dayKey(now, timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60_000), timeZone);
  const groups: Array<{ key: string; label: string; items: T[] }> = [];
  for (const item of items) {
    const key = dayKey(item.createdAt, timeZone);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const label = key === today
        ? "Hoy"
        : key === yesterday
          ? "Ayer"
          : new Intl.DateTimeFormat("es", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(item.createdAt);
      group = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
