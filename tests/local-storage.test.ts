import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { resolveLocalStorageObject, signLocalStorageToken, verifyLocalStorageToken } from "../src/lib/local-storage";

const secret = "pilot-local-storage-secret-at-least-32-characters";
const bucket = "local-private";
const objectPath = "tenant-a/announcements/drafts/admin-a/photo.png";
const expiresAt = 2_000_000;

test("la firma local vincula acción, bucket, ruta y vencimiento", () => {
  const signature = signLocalStorageToken(secret, "write", bucket, objectPath, expiresAt);
  assert.equal(verifyLocalStorageToken({ secret, action: "write", bucket, objectPath, expiresAt, signature, now: expiresAt - 1 }), true);
  assert.equal(verifyLocalStorageToken({ secret, action: "read", bucket, objectPath, expiresAt, signature, now: expiresAt - 1 }), false);
  assert.equal(verifyLocalStorageToken({ secret, action: "write", bucket, objectPath: objectPath.replace("tenant-a", "tenant-b"), expiresAt, signature, now: expiresAt - 1 }), false);
  assert.equal(verifyLocalStorageToken({ secret, action: "write", bucket, objectPath, expiresAt, signature, now: expiresAt + 1 }), false);
});

test("la resolución local rechaza traversal y rutas absolutas", () => {
  const root = join(process.cwd(), ".local-private-storage");
  assert.match(resolveLocalStorageObject(root, objectPath), /tenant-a/);
  for (const invalid of ["../tenant-b/file", "tenant-a/../../file", "/tenant-a/file", "tenant-a\\file", "tenant-a//file"]) {
    assert.throws(() => resolveLocalStorageObject(root, invalid), /Ruta de almacenamiento/);
  }
});
