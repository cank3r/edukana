---
inclusion: always
---
# Edukana — Estructura del código

```
src/
  proxy.ts                      resolución de tenant + redirecciones de sesión
  app/
    (platform)/platform/**      consola del operador (solo host app.edukana.com)
    (public)/                   sitio público del espacio: inicio, catálogo, curso, admisión, verificación
    (auth)/                     login, registro, invitación, recuperar, elegir espacio
    (app)/                      aplicación autenticada del espacio
      inicio/                   tablero por rol
      aprender/                 estudiante: mis cursos, reproductor, tareas, notas
      ensenar/                  docente: mis secciones, calificar, asistencia
      familia/                  tutor: mis hijos
      academico/                personal: estructura, cursos, ofertas, matrícula, notas, asistencia
      personas/                 directorio, importación, invitaciones, roles
      admisiones/
      finanzas/
      comunicacion/             avisos, mensajes, plantillas
      calendario/
      catalogo/                 gestión de cursos en venta, cupones, reseñas, instructores
      reportes/
      configuracion/            parámetros del espacio por sección
      cuenta/                   perfil y preferencias del usuario
    api/                        webhooks (pasarela, video), archivos, iCal, salud
  server/
    context.ts                  getRequestContext
    authz/                      permissions.ts (catálogo), roles.ts (plantillas), can.ts
    settings/                   registry.ts, get.ts, set.ts
    data/**                     DAL por dominio (un archivo por agregado)
    actions/**                  Server Actions por dominio
    jobs/**                     definiciones y worker
    integrations/               payments/, video/, email/, whatsapp/, meetings/
    audit.ts  crypto.ts  db.ts  dbPlatform.ts
  components/
    ui/                         primitivos (Button, Input, Select, Dialog, Table, Tabs, Toast, EmptyState…)
    shell/                      AppShell, Sidebar, Topbar, TenantSwitcher, RoleSwitcher
    domain/**                   componentes por dominio
  lib/                          utilidades puras (formato, fechas, dinero, i18n)
prisma/                         schema.prisma, migrations, seed
tests/                          integration/**, e2e/**
.kiro/                          steering y specs
```

Convenciones: rutas en español y minúsculas; archivos de componente en PascalCase; una Server Action por archivo cuando supera 60 líneas; nada de líneas JSX de cientos de caracteres (formatear con Prettier).
