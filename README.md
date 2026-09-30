# Edukana

> La educación evoluciona. Tú también.

Plataforma integral para digitalizar instituciones educativas con inteligencia artificial.
Producto de [Cerkana](https://cerkana.site).

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Auth | NextAuth.js v5 (Auth.js) |
| Base de datos | PostgreSQL vía Supabase (free tier) |
| ORM | Prisma |
| IA | Google Gemini 2.0 Flash (gratuito) |
| Archivos | Cloudflare R2 (10GB gratis/mes) |
| Email | Resend (3,000 emails/mes gratis) |
| Deploy | Vercel (hobby, gratuito) |

## Módulos MVP

- **Portal** — experiencia por rol (admin, docente, estudiante)
- **Gestión Académica** — períodos, materias, estudiantes, asistencia
- **Aula** — cursos, módulos, tareas, calificaciones
- **Comunidad** — anuncios y calendario
- **Admisiones** — pipeline del prospecto a la matrícula
- **Pagos** — control de cobros (sin pasarela en MVP)
- **Inteligencia Edukana** — generador IA de actividades y comunicados

## Inicio rápido

### 1. Clonar y configurar

```bash
git clone https://github.com/cank3r/edukana.git
cd edukana
npm install
cp .env.example .env.local
# Edita .env.local con tus credenciales
```

### 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (gratis)
2. Ve a Settings > Database > Connection string
3. Copia la URL del **Transaction pooler** → `DATABASE_URL`
4. Copia la URL del **Session pooler** → `DIRECT_URL`

### 3. Migrar la base de datos

```bash
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
```

### 4. Correr en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

### Credenciales demo

| Rol | Email | Contraseña |
|---|---|---|
| Admin | admin@demo.edukana | edukana2026 |
| Docente | docente@demo.edukana | docente2026 |
| Estudiante | estudiante@demo.edukana | estudiante2026 |

## Estructura del proyecto

```
edukana/
├── prisma/
│   ├── schema.prisma      # Modelo de datos completo
│   └── seed.ts            # Datos iniciales de desarrollo
├── src/
│   ├── app/               # Next.js App Router
│   │   ├── (auth)/        # Login / registro
│   │   ├── dashboard/     # App principal (protegida)
│   │   └── api/           # API Routes
│   ├── components/        # Componentes React
│   │   ├── dashboard/     # Sidebar, Header, etc.
│   │   └── ui/            # Componentes base
│   └── lib/
│       ├── auth.ts        # Configuración NextAuth
│       ├── db.ts          # Prisma client singleton
│       └── utils.ts       # Helpers
└── .env.example           # Variables de entorno necesarias
```

## Variables de entorno

Ver `.env.example` para la lista completa. Las mínimas para desarrollo:

```env
DATABASE_URL=           # Supabase Transaction pooler
DIRECT_URL=             # Supabase Session pooler
AUTH_SECRET=            # openssl rand -base64 32
GEMINI_API_KEY=         # Google AI Studio
```

## Despliegue en Vercel

```bash
# Instala Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Configura las variables de entorno en el dashboard de Vercel antes del primer deploy.

---

**Edukana by Cerkana** · [cerkana.site](https://cerkana.site) · [info@cerkana.site](mailto:info@cerkana.site)
