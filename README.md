# Edukana

> La educación evoluciona. Tú también.

MVP multiinstitución para gestión académica, aula, comunidad, admisiones, pagos y analítica. Producto de [Cerkana](https://cerkana.site).

## Stack

- Next.js 16 (App Router), React 19, TypeScript y Tailwind CSS 4
- Auth.js v5 con credenciales, sesiones JWT y RBAC
- PostgreSQL en Supabase y Prisma 5
- Vercel Hobby y Supabase Free compatibles

## Funcionalidad MVP

- Inicio con indicadores según rol.
- Gestión y perfil de estudiantes.
- Cursos, módulos publicados, tareas y acceso limitado por matrícula/docencia.
- Anuncios institucionales por audiencia.
- Pipeline y alta de admisiones.
- Estado de cuenta, registro y actualización de pagos.
- Analítica institucional.
- Portal del estudiante con cursos, tareas, notas y pagos.
- Configuración editable de la institución.

Todas las lecturas y escrituras de negocio se limitan a la institución de la sesión. Las mutaciones validan datos en el servidor y vuelven a comprobar rol y pertenencia.

## Desarrollo local

Requisitos: Node.js 20.9 o superior, npm y un proyecto PostgreSQL/Supabase.

```bash
npm ci
copy .env.example .env.local
npx prisma validate
npx prisma generate
npm run db:push
npm run db:seed
npm run dev
```

Completa las variables en `.env.local` antes de ejecutar comandos de Prisma. El seed exige tres contraseñas distintas de 12 o más caracteres y no imprime credenciales.

## Supabase Free

1. Crea el proyecto y copia la URL del **Transaction pooler** a `DATABASE_URL`; conserva `pgbouncer=true&connection_limit=1` para funciones serverless.
2. Copia la conexión directa o **Session pooler** a `DIRECT_URL`; Prisma la usa para operaciones de esquema.
3. Ejecuta `npm run db:push` desde un entorno de confianza. No apliques cambios de esquema automáticamente durante el build de Vercel.
4. Ejecuta `npm run db:seed` solo para entornos demo o desarrollo.

El esquema actual no requiere extensiones de pago. Para una base con datos, revisa primero cualquier cambio con `npx prisma migrate diff` y evita `--accept-data-loss`.

## Vercel

1. Importa [github.com/cank3r/edukana](https://github.com/cank3r/edukana) en Vercel.
2. Configura `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` y `AUTH_URL` en Production y Preview. Usa la URL HTTPS canónica para `AUTH_URL`.
3. No configures variables `SEED_*` en producción y no expongas secretos con el prefijo `NEXT_PUBLIC_`.
4. Mantén el comando de instalación por defecto (`npm install`) y el build `npm run build`; `postinstall` genera Prisma Client.
5. Antes del deploy ejecuta:

```bash
npm run lint
npm run typecheck
npx prisma validate
npm run build
```

## Calidad y CI

La suite mínima cubre normalización de credenciales, rutas públicas y permisos por rol. CircleCI ejecuta Prisma, pruebas, ESLint, TypeScript y el build de producción en cada cambio.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Scripts

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript estricto |
| `npm test` | Pruebas de validación y RBAC |
| `npm run db:push` | Sincroniza el esquema sin borrar datos |
| `npm run db:seed` | Carga datos demo idempotentes |
| `npm run db:studio` | Abre Prisma Studio |

## Variables

Consulta `.env.example`. Los únicos valores públicos deben llevar `NEXT_PUBLIC_`; las conexiones, credenciales, tokens y claves permanecen exclusivamente en el servidor.
