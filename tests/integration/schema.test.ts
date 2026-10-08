import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db } from "@/lib/db";
import { A, ensureSeed } from "./setup";

before(ensureSeed);
after(async () => {
  await db.announcement.deleteMany({ where: { id: "it_default_audience" } });
  await db.$disconnect();
});

test("s1_security: un aviso creado sin audiencia no queda visible para toda la institución", async () => {
  const created = await db.announcement.create({
    data: { id: "it_default_audience", institutionId: A.institutionId, authorId: A.admin.id, title: "Sin audiencia", content: "x" },
    select: { audience: true, audienceInstitution: true },
  });
  assert.deepEqual(created, { audience: "ROLE", audienceInstitution: false });
});

test("s1_security: un cobro no puede referenciar a un estudiante inexistente", async () => {
  await assert.rejects(
    db.paymentConcept.create({
      data: { institutionId: A.institutionId, studentId: "no_existe", concept: "Prueba", amount: 1, amountCents: 100 },
    }),
  );
});
