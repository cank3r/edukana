-- Semilla de integración: dos instituciones con la misma forma.
-- IDs fijos con prefijo a_ / b_. Se carga sobre una base recién migrada.

INSERT INTO institutions (id, name, slug, type, "updatedAt") VALUES ('a_inst', 'Instituto A', 'instituto-a', 'INSTITUTE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_admin', 'a_inst', 'admin A', 'admin@a.test', 'ADMIN', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_coord', 'a_inst', 'coord A', 'coord@a.test', 'COORDINATOR', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_teacher', 'a_inst', 'teacher A', 'docente@a.test', 'TEACHER', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_teacher2', 'a_inst', 'teacher2 A', 'compartido@prueba.test', 'TEACHER', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_student', 'a_inst', 'student A', 'estudiante@a.test', 'STUDENT', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_student2', 'a_inst', 'student2 A', 'estudiante2@a.test', 'STUDENT', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_parent', 'a_inst', 'parent A', 'tutor@a.test', 'PARENT', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('a_suspended', 'a_inst', 'suspendido A', 'suspendido@a.test', 'STUDENT', 'SUSPENDED', now());
INSERT INTO academic_periods (id, "institutionId", name, "startDate", "endDate", "isActive") VALUES ('a_period', 'a_inst', 'Período A', '2026-09-01', '2027-06-30', true);
INSERT INTO courses (id, "institutionId", "periodId", "teacherId", name, code, "updatedAt") VALUES ('a_course', 'a_inst', 'a_period', 'a_teacher', 'course A', 'COURSE-1', now());
INSERT INTO courses (id, "institutionId", "periodId", "teacherId", name, code, "updatedAt") VALUES ('a_course2', 'a_inst', 'a_period', 'a_teacher2', 'course2 A', 'COURSE2-1', now());
INSERT INTO enrollments (id, "institutionId", "studentId", "courseId", status) VALUES ('a_enrollment', 'a_inst', 'a_student', 'a_course', 'ACTIVE');
INSERT INTO announcements (id, "institutionId", "authorId", title, content, audience, "audienceId") VALUES ('a_announcement', 'a_inst', 'a_admin', 'Aviso del curso A', 'Contenido', 'COURSE', 'a_course');
INSERT INTO announcement_course_targets ("institutionId", "announcementId", "courseId") VALUES ('a_inst', 'a_announcement', 'a_course');
INSERT INTO guardianships (id, "institutionId", "parentId", "studentId", relationship, status, "canViewAcademics", "canViewAnnouncements", "createdById", "updatedById", "updatedAt") VALUES ('a_guardianship', 'a_inst', 'a_parent', 'a_student', 'MOTHER', 'ACTIVE', true, true, 'a_admin', 'a_admin', now());

INSERT INTO institutions (id, name, slug, type, "updatedAt") VALUES ('b_inst', 'Instituto B', 'instituto-b', 'INSTITUTE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_admin', 'b_inst', 'admin B', 'admin@b.test', 'ADMIN', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_coord', 'b_inst', 'coord B', 'coord@b.test', 'COORDINATOR', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_teacher', 'b_inst', 'teacher B', 'docente@b.test', 'TEACHER', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_teacher2', 'b_inst', 'teacher2 B', 'compartido@prueba.test', 'TEACHER', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_student', 'b_inst', 'student B', 'estudiante@b.test', 'STUDENT', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_student2', 'b_inst', 'student2 B', 'estudiante2@b.test', 'STUDENT', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_parent', 'b_inst', 'parent B', 'tutor@b.test', 'PARENT', 'ACTIVE', now());
INSERT INTO users (id, "institutionId", name, email, role, status, "updatedAt") VALUES ('b_suspended', 'b_inst', 'suspendido B', 'suspendido@b.test', 'STUDENT', 'SUSPENDED', now());
INSERT INTO academic_periods (id, "institutionId", name, "startDate", "endDate", "isActive") VALUES ('b_period', 'b_inst', 'Período B', '2026-09-01', '2027-06-30', true);
INSERT INTO courses (id, "institutionId", "periodId", "teacherId", name, code, "updatedAt") VALUES ('b_course', 'b_inst', 'b_period', 'b_teacher', 'course B', 'COURSE-1', now());
INSERT INTO courses (id, "institutionId", "periodId", "teacherId", name, code, "updatedAt") VALUES ('b_course2', 'b_inst', 'b_period', 'b_teacher2', 'course2 B', 'COURSE2-1', now());
INSERT INTO enrollments (id, "institutionId", "studentId", "courseId", status) VALUES ('b_enrollment', 'b_inst', 'b_student', 'b_course', 'ACTIVE');
INSERT INTO announcements (id, "institutionId", "authorId", title, content, audience, "audienceId") VALUES ('b_announcement', 'b_inst', 'b_admin', 'Aviso del curso B', 'Contenido', 'COURSE', 'b_course');
INSERT INTO announcement_course_targets ("institutionId", "announcementId", "courseId") VALUES ('b_inst', 'b_announcement', 'b_course');
INSERT INTO guardianships (id, "institutionId", "parentId", "studentId", relationship, status, "canViewAcademics", "canViewAnnouncements", "createdById", "updatedById", "updatedAt") VALUES ('b_guardianship', 'b_inst', 'b_parent', 'b_student', 'MOTHER', 'ACTIVE', true, true, 'b_admin', 'b_admin', now());
