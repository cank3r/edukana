import { timingSafeEqual } from "node:crypto";
import { expirePlatformSubscriptions } from "@/server/platform/subscriptions";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  return Response.json({ pastDue: await expirePlatformSubscriptions() });
}
