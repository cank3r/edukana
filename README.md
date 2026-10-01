# Edukana

> La educación evoluciona. Tú también.

MVP académico multiinstitución de Cerkana, construido en español con la identidad visual oficial de Edukana. Replica el flujo de aprendizaje por secciones y lecciones, no el diseño ni código de otras plataformas.

## Capacidades del MVP real

1. **Asistencia:** captura por curso y fecha, estados por estudiante y reportes acumulados.
2. **Libro de calificaciones:** períodos, categorías ponderadas, descarte de notas bajas, elementos publicables y vista del estudiante.
3. **Asignaciones:** instrucciones, vencimiento, entrega, archivos privados, revisión, retroalimentación y puntuación.
4. **Exámenes:** banco reutilizable, selección múltiple, verdadero/falso, respuesta corta, intentos, autocalificación y revisión manual.
5. **Horarios:** vista institucional y por curso con docente, aula y hora; bloquea solapamientos de docente o aula.
6. **Certificados:** emisión al completar el curso, código público, hash firmado, revocación soportada y verificación HTML/JSON.
7. **Documentos:** carga validada a bucket privado y recuperación con autorización más URL firmada de 5 minutos.
8. **Video:** carga MP4/WebM privada y reproducción HTML5 autorizada.
9. **Ruta de aprendizaje:** curso > secciones > lecciones ordenadas (texto, video, documento, actividad), con progreso individual.

Todas las entidades sensibles conservan `institutionId`. Las consultas y mutaciones vuelven a comprobar institución, rol, docencia, matrícula o propiedad del recurso; una página visible no se considera autorización suficiente.

## Stack e infraestructura sin costo obligatorio

- Next.js 16.3 (App Router), React 19, TypeScript y Tailwind CSS 4.
- Auth.js v5 con credenciales, JWT, tenant y RBAC.
- Prisma 5 y PostgreSQL en Supabase Free.
- Supabase Storage Free con bucket **privado**. La aplicación usa su API REST desde el servidor, sin SDK adicional.
- Vercel Hobby o cualquier host Node.js compatible.

No se guardan archivos en el filesystem efímero del host y ninguna clave se expone con `NEXT_PUBLIC_`.

## Instalación local

Requisitos: Node.js 22, npm y un proyecto Supabase/PostgreSQL.

```powershell
npm ci
Copy-Item .env.example .env.local
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Completa `C:\Users\crami\workspace\edukana\.env.local` sin confirmarlo en Git. El seed exige tres contraseñas distintas de 12+ caracteres y no las imprime.

## Base de datos

- `DATABASE_URL`: Transaction Pooler de Supabase (`pgbouncer=true&connection_limit=1`) para runtime.
- `DIRECT_URL`: conexión directa o Session Pooler para migraciones.
- La migración versionada está en `C:\Users\crami\workspace\edukana\prisma\migrations\20261001193000_real_edukana_mvp\migration.sql`.
- Producción usa `npx prisma migrate deploy`; nunca `db push` con pérdida de datos.

## Storage privado

1. Crea un bucket privado llamado `edukana` en Supabase Storage.
2. Configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_STORAGE_BUCKET` solo en el servidor.
3. No hagas público el bucket. `POST /api/assets` valida sesión, tenant, relación con curso/entrega, MIME y tamaño.
4. `GET /api/assets/:id` autoriza de nuevo y redirige a una URL firmada por 5 minutos.

Límites MVP: documentos PDF/DOCX/PPTX/TXT hasta 20 MB; videos MP4/WebM hasta 100 MB. El registro conserva MIME, tamaño, SHA-256, cargador, tenant y ruta con prefijo de tenant.

## Demo verificable

Define `SEED_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD` y `SEED_STUDENT_PASSWORD`, ejecuta `npm run db:seed` y usa:

- `admin@demo.edukana`: administración y emisión de certificados.
- `docente@demo.edukana`: asistencia, contenidos, asignaciones, notas, banco, exámenes y horario.
- `estudiante@demo.edukana`: ruta, progreso, entregas, intentos, notas publicadas y certificado.

Las contraseñas son exclusivamente las que configuraste. Curso demo: **MAT-101 Matemática I**. Certificado demo (si existe `CERTIFICATE_SECRET` o `AUTH_SECRET`): `/certificados/EDU-DEMO2026A`; registro de máquina: `/api/certificados/EDU-DEMO2026A`.

## Validación

```powershell
npx prisma validate
npx prisma generate
npm test
npm run test:auth
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
git diff --check origin/master...HEAD
```

CircleCI ejecuta la misma puerta de calidad. Los tests cubren RBAC/rutas, ponderación, conflictos, respuestas objetivas, progreso, certificados, cargas y presencia de todas las entidades multi-tenant.

## Variables

Consulta `C:\Users\crami\workspace\edukana\.env.example`. Son secretas: conexiones, `AUTH_SECRET`, `CERTIFICATE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` y contraseñas de seed. No confirmes archivos `.env*`.
