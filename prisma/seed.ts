import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function required(name: "SEED_ADMIN_PASSWORD" | "SEED_TEACHER_PASSWORD" | "SEED_STUDENT_PASSWORD") {
  const value = process.env[name];
  if (!value || value.length < 8) throw new Error(`${name} debe existir y tener al menos 8 caracteres.`);
  return value;
}

async function main() {
  const institution = await prisma.institution.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Instituto Demo Edukana", slug: "demo", type: "SCHOOL", timezone: "America/Santo_Domingo", language: "es", plan: "FREE" },
  });

  const [adminPassword, teacherPassword, studentPassword] = await Promise.all([
    bcrypt.hash(required("SEED_ADMIN_PASSWORD"), 12),
    bcrypt.hash(required("SEED_TEACHER_PASSWORD"), 12),
    bcrypt.hash(required("SEED_STUDENT_PASSWORD"), 12),
  ]);
  const admin = await prisma.user.upsert({
    where: { institutionId_email: { institutionId: institution.id, email: "admin@demo.edukana" } },
    update: { password: adminPassword, status: "ACTIVE" },
    create: { institutionId: institution.id, name: "Administrador Demo", email: "admin@demo.edukana", password: adminPassword, role: "ADMIN", status: "ACTIVE" },
  });
  const teacher = await prisma.user.upsert({
    where: { institutionId_email: { institutionId: institution.id, email: "docente@demo.edukana" } },
    update: { password: teacherPassword, status: "ACTIVE" },
    create: { institutionId: institution.id, name: "Docente Demo", email: "docente@demo.edukana", password: teacherPassword, role: "TEACHER", status: "ACTIVE" },
  });
  const student = await prisma.user.upsert({
    where: { institutionId_email: { institutionId: institution.id, email: "estudiante@demo.edukana" } },
    update: { password: studentPassword, status: "ACTIVE" },
    create: { institutionId: institution.id, name: "Estudiante Demo", email: "estudiante@demo.edukana", password: studentPassword, role: "STUDENT", status: "ACTIVE" },
  });
  const period = await prisma.academicPeriod.upsert({
    where: { id: "period-demo-2026" },
    update: { institutionId: institution.id },
    create: { id: "period-demo-2026", institutionId: institution.id, name: "2026-I", startDate: new Date("2026-01-15"), endDate: new Date("2026-12-15"), isActive: true },
  });
  const course = await prisma.course.upsert({
    where: { id: "course-demo-matematica" },
    update: { institutionId: institution.id, periodId: period.id, teacherId: teacher.id },
    create: { id: "course-demo-matematica", institutionId: institution.id, periodId: period.id, teacherId: teacher.id, name: "Matemática I", code: "MAT-101", description: "Fundamentos de álgebra y cálculo diferencial." },
  });
  await prisma.enrollment.upsert({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
    update: { status: "ACTIVE" },
    create: { studentId: student.id, courseId: course.id, status: "ACTIVE" },
  });
  const moduleExists = await prisma.courseModule.findFirst({ where: { courseId: course.id, title: "Introducción al curso" }, select: { id: true } });
  if (!moduleExists) await prisma.courseModule.create({ data: { courseId: course.id, title: "Introducción al curso", content: "Objetivos, metodología y recursos iniciales del curso.", order: 0, isPublished: true } });
  const assignmentExists = await prisma.assignment.findFirst({ where: { courseId: course.id, title: "Actividad diagnóstica" }, select: { id: true } });
  if (!assignmentExists) await prisma.assignment.create({ data: { courseId: course.id, title: "Actividad diagnóstica", description: "Resuelve los ejercicios iniciales.", dueDate: new Date("2026-12-01"), isPublished: true } });
  const announcementExists = await prisma.announcement.findFirst({ where: { institutionId: institution.id, title: "Bienvenidos a Edukana" }, select: { id: true } });
  if (!announcementExists) await prisma.announcement.create({ data: { institutionId: institution.id, authorId: admin.id, title: "Bienvenidos a Edukana", content: "La plataforma ya está disponible para toda la comunidad educativa.", audience: "ALL", isPinned: true } });
  const paymentExists = await prisma.paymentConcept.findFirst({ where: { institutionId: institution.id, studentId: student.id, concept: "Matrícula 2026" }, select: { id: true } });
  if (!paymentExists) await prisma.paymentConcept.create({ data: { institutionId: institution.id, studentId: student.id, periodId: period.id, concept: "Matrícula 2026", amount: 5000, currency: "DOP", dueDate: new Date("2026-10-15"), status: "PENDING" } });
  const leadExists = await prisma.admissionLead.findFirst({ where: { institutionId: institution.id, email: "aspirante@example.com" }, select: { id: true } });
  if (!leadExists) await prisma.admissionLead.create({ data: { institutionId: institution.id, name: "Aspirante Demo", email: "aspirante@example.com", programInterest: "Bachillerato", source: "web" } });
  console.log("Seed completado: institución, usuarios y datos MVP verificados.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Error de seed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
