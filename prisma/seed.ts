/**
 * Edukana — Seed inicial
 * Crea la institución demo y el usuario administrador para desarrollo.
 * Uso: npx ts-node prisma/seed.ts  (o: npx prisma db seed)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Sembrando datos iniciales de Edukana...\n");

  // 1. Institución demo
  const institution = await prisma.institution.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Instituto Demo Edukana",
      slug: "demo",
      type: "SCHOOL",
      timezone: "America/Santo_Domingo",
      language: "es",
      plan: "FREE",
    },
  });
  console.log(`✅ Institución: ${institution.name} (${institution.id})`);

  // 2. Admin
  const adminPassword = await bcrypt.hash("edukana2026", 12);
  const admin = await prisma.user.upsert({
    where: { institutionId_email: { institutionId: institution.id, email: "admin@demo.edukana" } },
    update: {},
    create: {
      institutionId: institution.id,
      name: "Administrador Demo",
      email: "admin@demo.edukana",
      password: adminPassword,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  console.log(`✅ Admin: ${admin.email} / contraseña: edukana2026`);

  // 3. Docente de ejemplo
  const teacherPassword = await bcrypt.hash("docente2026", 12);
  const teacher = await prisma.user.upsert({
    where: { institutionId_email: { institutionId: institution.id, email: "docente@demo.edukana" } },
    update: {},
    create: {
      institutionId: institution.id,
      name: "María González",
      email: "docente@demo.edukana",
      password: teacherPassword,
      role: "TEACHER",
      status: "ACTIVE",
    },
  });
  console.log(`✅ Docente: ${teacher.email} / contraseña: docente2026`);

  // 4. Estudiante de ejemplo
  const studentPassword = await bcrypt.hash("estudiante2026", 12);
  const student = await prisma.user.upsert({
    where: { institutionId_email: { institutionId: institution.id, email: "estudiante@demo.edukana" } },
    update: {},
    create: {
      institutionId: institution.id,
      name: "Carlos Ramírez",
      email: "estudiante@demo.edukana",
      password: studentPassword,
      role: "STUDENT",
      status: "ACTIVE",
    },
  });
  console.log(`✅ Estudiante: ${student.email} / contraseña: estudiante2026`);

  // 5. Período académico
  const period = await prisma.academicPeriod.upsert({
    where: { id: "period-demo-2026" },
    update: {},
    create: {
      id: "period-demo-2026",
      institutionId: institution.id,
      name: "2026-I",
      startDate: new Date("2026-01-15"),
      endDate: new Date("2026-06-30"),
      isActive: true,
    },
  });
  console.log(`✅ Período: ${period.name}`);

  // 6. Curso de ejemplo
  const course = await prisma.course.upsert({
    where: { id: "course-demo-matematica" },
    update: {},
    create: {
      id: "course-demo-matematica",
      institutionId: institution.id,
      periodId: period.id,
      teacherId: teacher.id,
      name: "Matemática I",
      code: "MAT-101",
      description: "Fundamentos de álgebra y cálculo diferencial.",
      schedule: [
        { day: "MON", start: "08:00", end: "09:30" },
        { day: "WED", start: "08:00", end: "09:30" },
      ],
    },
  });
  console.log(`✅ Curso: ${course.name}`);

  // 7. Inscripción del estudiante
  await prisma.enrollment.upsert({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
    update: {},
    create: {
      studentId: student.id,
      courseId: course.id,
      status: "ACTIVE",
    },
  });
  console.log(`✅ Inscripción: ${student.name} → ${course.name}`);

  // 8. Anuncio de bienvenida
  await prisma.announcement.create({
    data: {
      institutionId: institution.id,
      authorId: admin.id,
      title: "¡Bienvenidos al nuevo período académico!",
      content:
        "Estamos muy contentos de iniciar este nuevo período con toda la comunidad educativa. Les informamos que la plataforma Edukana está disponible para que puedan acceder a sus clases, calificaciones y comunicaciones desde un solo lugar.",
      audience: "ALL",
      isPinned: true,
    },
  });
  console.log(`✅ Anuncio de bienvenida creado`);

  console.log("\n🎉 Seed completado exitosamente.\n");
  console.log("Credenciales para desarrollo:");
  console.log("  Admin:      admin@demo.edukana / edukana2026");
  console.log("  Docente:    docente@demo.edukana / docente2026");
  console.log("  Estudiante: estudiante@demo.edukana / estudiante2026");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
