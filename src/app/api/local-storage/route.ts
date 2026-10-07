import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveLocalStorageObject, verifyLocalStorageToken, type LocalStorageAction } from "@/lib/local-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

type LocalConfig = { root: string; bucket: string; secret: string };

type Metadata = { contentType: string; size: number; etag: string };

function config(): LocalConfig | null {
  const root = process.env.LOCAL_STORAGE_ROOT;
  const secret = process.env.LOCAL_STORAGE_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!root) return null;
  if (!secret || secret.length < 32) throw new Error("LOCAL_STORAGE_SECRET debe tener al menos 32 caracteres.");
  return { root, secret, bucket: "local-private" };
}

function authorized(request: Request, action: LocalStorageAction) {
  const local = config();
  if (!local) return null;
  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket") ?? "";
  const objectPath = url.searchParams.get("path") ?? "";
  const signature = url.searchParams.get("signature") ?? "";
  const expiresAt = Number(url.searchParams.get("expires"));
  if (bucket !== local.bucket || !verifyLocalStorageToken({ secret: local.secret, action, bucket, objectPath, expiresAt, signature })) return null;
  return { ...local, objectPath, filePath: resolveLocalStorageObject(local.root, objectPath) };
}

export async function PUT(request: Request) {
  const target = authorized(request, "write");
  if (!target) return Response.json({ error: "Carga no autorizada o vencida." }, { status: 403 });
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BYTES) return Response.json({ error: "El archivo supera 100 MB." }, { status: 413 });
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return Response.json({ error: "El archivo está vacío o supera 100 MB." }, { status: 413 });
  const metadata: Metadata = { contentType, size: bytes.length, etag: createHash("sha256").update(bytes).digest("hex") };
  await mkdir(dirname(target.filePath), { recursive: true });
  await writeFile(target.filePath, bytes, { flag: "wx" });
  await writeFile(`${target.filePath}.meta.json`, JSON.stringify(metadata), { flag: "wx" });
  return Response.json({ ok: true }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const target = authorized(request, "read");
  if (!target) return Response.json({ error: "Descarga no autorizada o vencida." }, { status: 403 });
  try {
    const [bytes, rawMetadata] = await Promise.all([readFile(target.filePath), readFile(`${target.filePath}.meta.json`, "utf8")]);
    const metadata = JSON.parse(rawMetadata) as Metadata;
    const body = new Uint8Array(bytes.length);
    body.set(bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-length": String(bytes.length),
        "content-type": metadata.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Archivo no encontrado." }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  const target = authorized(request, "write");
  if (!target) return Response.json({ error: "Eliminación no autorizada o vencida." }, { status: 403 });
  await Promise.all([rm(target.filePath, { force: true }), rm(`${target.filePath}.meta.json`, { force: true })]);
  return new Response(null, { status: 204 });
}
