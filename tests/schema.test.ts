import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

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
