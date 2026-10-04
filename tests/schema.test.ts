import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(join(process.cwd(), "prisma", "migrations", "20261001193000_real_edukana_mvp", "migration.sql"), "utf8");
const announcementMigration = readFileSync(join(process.cwd(), "prisma", "migrations", "20261004111500_advanced_announcements", "migration.sql"), "utf8");
const announcementMimeMigration = readFileSync(join(process.cwd(), "prisma", "migrations", "20261004223000_announcement_image_mimes", "migration.sql"), "utf8");

const requiredModels = ["AttendanceSession", "Attendance", "GradingPeriod", "GradeCategory", "GradeItem", "GradeEntry", "Assignment", "Submission", "QuestionBankItem", "Exam", "ExamQuestion", "ExamAttempt", "ExamAnswer", "ScheduleSlot", "Certificate", "StorageAsset", "CourseSection", "Lesson", "LessonProgress"];

test("incluye las nueve capacidades académicas obligatorias", () => {
  for (const model of requiredModels) assert.match(schema, new RegExp(`model ${model} \\{`), `falta ${model}`);
  for (const questionType of ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]) assert.match(schema, new RegExp(`\\b${questionType}\\b`));
});

test("las entidades académicas sensibles tienen institución directa", () => {
  for (const model of ["AttendanceSession", "Attendance", "GradingPeriod", "GradeCategory", "GradeItem", "GradeEntry", "QuestionBankItem", "Exam", "ExamAttempt", "ScheduleSlot", "Certificate", "StorageAsset", "CourseSection", "Lesson", "LessonProgress"]) {
    const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    assert.match(body, /institutionId\s+String/, `${model} debe incluir institutionId`);
  }
});

test("el almacenamiento conserva ruta privada, MIME, tamaño y checksum", () => {
  const body = schema.match(/model StorageAsset \{([\s\S]*?)\n\}/)?.[1] ?? "";
  for (const field of ["objectPath", "mimeType", "sizeBytes", "checksum", "visibility"]) assert.match(body, new RegExp(`\\b${field}\\b`));
});



test("aprovisiona el bucket académico como privado", () => {
  assert.match(migration, /INSERT INTO storage\.buckets/);
  assert.match(migration, /'edukana',[\s\S]*?false,[\s\S]*?104857600/);
  assert.doesNotMatch(migration, /'edukana',[\s\S]*?true,[\s\S]*?104857600/);
});

test("normaliza audiencias de anuncios sin romper registros existentes", () => {
  for (const model of ["OrganizationalUnit", "OrganizationalUnitMembership", "AnnouncementRoleTarget", "AnnouncementCourseTarget", "AnnouncementUserTarget", "AnnouncementUnitTarget", "AnnouncementRelatedCourse", "AnnouncementMention"]) {
    const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    assert.match(body, /institutionId\s+String/, `${model} debe incluir institutionId`);
  }
  assert.match(schema, /audienceInstitution\s+Boolean/);
  assert.match(schema, /confirmedAt\s+DateTime\?/);
  assert.match(announcementMigration, /UPDATE "announcements" SET "audienceInstitution" = true WHERE "audience" = 'ALL'/);
  assert.match(announcementMigration, /INSERT INTO "announcement_role_targets"/);
  assert.match(announcementMigration, /INSERT INTO "announcement_course_targets"/);
});


test("el bucket privado admite imágenes y conserva documentos y videos", () => {
  for (const mime of ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "video/mp4", "video/webm"]) {
    assert.match(announcementMimeMigration, new RegExp(`'${mime.replace("/", "\\/")}'`));
  }
  assert.match(announcementMimeMigration, /public = false/);
  assert.match(announcementMimeMigration, /file_size_limit = 104857600/);
});
