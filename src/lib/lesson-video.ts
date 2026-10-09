import { z } from "zod";

/**
 * Video de una lección (además de su texto), por enlace.
 *
 * Se aceptan solo estas fuentes, y la dirección que se muestra se arma aquí con el código del
 * video ya validado; nunca se usa tal cual lo que escribió el docente:
 * - YouTube → `https://www.youtube-nocookie.com/embed/<id>` (en un iframe)
 * - Vimeo → `https://player.vimeo.com/video/<id>` (+ `?h=` si es un video no listado)
 * - Google Drive → `https://drive.google.com/file/d/<id>/preview`
 * - Un archivo de video directo `https://…/clase.mp4` (o `.webm`) → reproductor propio `<video controls>`
 * - Un video ya subido a Edukana (`/api/assets/<id>`) → reproductor propio
 *
 * Cualquier otro dominio, protocolo (`javascript:`, `data:`, `http:`) o forma se rechaza.
 * La función es idempotente: normalizar una dirección ya normalizada devuelve la misma.
 */

export type LessonVideo =
  | { kind: "iframe"; provider: "YouTube" | "Vimeo" | "Google Drive"; src: string }
  | { kind: "file"; src: string };

export const IFRAME_VIDEO_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://drive.google.com"] as const;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const VIMEO_HASH = /^[A-Za-z0-9]{6,20}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{20,80}$/;
const ASSET_ID = /^[a-z0-9]{10,40}$/i;
const FILE_EXTENSION = /\.(mp4|webm)$/i;

function youtube(host: string, parts: string[], url: URL): LessonVideo | null {
  let id: string | null = null;
  if (host === "youtu.be") id = parts[0] ?? null;
  else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") id = parts[1] ?? null;
  } else return null;
  return id && YOUTUBE_ID.test(id) ? { kind: "iframe", provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
}

function vimeo(host: string, parts: string[], url: URL): LessonVideo | null {
  let id: string | null = null;
  let hash: string | null = null;
  if (host === "vimeo.com") {
    id = parts[0] ?? null;
    hash = parts[1] ?? null;
  } else if (host === "player.vimeo.com" && parts[0] === "video") {
    id = parts[1] ?? null;
    hash = url.searchParams.get("h");
  } else return null;
  if (!id || !VIMEO_ID.test(id)) return null;
  if (hash && !VIMEO_HASH.test(hash)) return null;
  return { kind: "iframe", provider: "Vimeo", src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}` };
}

function drive(host: string, parts: string[], url: URL): LessonVideo | null {
  if (host !== "drive.google.com") return null;
  let id: string | null = null;
  if (parts[0] === "file" && parts[1] === "d") id = parts[2] ?? null;
  else if (parts[0] === "open" || parts[0] === "uc") id = url.searchParams.get("id");
  return id && DRIVE_ID.test(id) ? { kind: "iframe", provider: "Google Drive", src: `https://drive.google.com/file/d/${id}/preview` } : null;
}

/** Dirección segura para mostrar el video, o null si el enlace no es de una fuente permitida. */
export function normalizeLessonVideo(raw: string | null | undefined): LessonVideo | null {
  const value = (raw ?? "").trim();
  if (!value || value.length > 2000 || /\s/.test(value)) return null;

  // Video subido a Edukana: el permiso lo vuelve a comprobar /api/assets al abrirlo.
  const asset = /^\/api\/assets\/([^/?#]+)$/.exec(value);
  if (asset) return ASSET_ID.test(asset[1]) ? { kind: "file", src: `/api/assets/${asset[1]}` } : null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  const embedded = youtube(host, parts, url) ?? vimeo(host, parts, url) ?? drive(host, parts, url);
  if (embedded) return embedded;
  // Archivo directo: va en <video>, nunca en un iframe, así que el dominio puede ser cualquiera.
  if (FILE_EXTENSION.test(url.pathname)) return { kind: "file", src: url.toString() };
  return null;
}

export const VIDEO_URL_HELP = "Pega un enlace de YouTube, Vimeo, Google Drive o de un archivo .mp4.";

/** Campo opcional del formulario: vacío → null; si no, la dirección ya normalizada. */
export const lessonVideoUrlSchema = z
  .string()
  .trim()
  .max(2000, "El enlace del video es demasiado largo.")
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const video = normalizeLessonVideo(value);
    if (!video) {
      ctx.addIssue({ code: "custom", message: `No podemos mostrar ese video. ${VIDEO_URL_HELP}` });
      return z.NEVER;
    }
    return video.src;
  });
