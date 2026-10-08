# Guion canónico del MVP: institución piloto

Este guion es la definición de terminado del MVP y tiene dos ejecuciones complementarias. `bootstrap` recorre una instalación controlada desde una base PostgreSQL vacía; `existing` valida el Preview sobre el staging persistente de Edukana mediante datos exclusivos del run, sin borrar información existente. El recorrido no usa `prisma/seed.ts`, SQL manual ni datos preparados.

## Precondiciones desplegables

1. Configurar `DATABASE_URL`, `DIRECT_URL` y `AUTH_SECRET`. Para staging/producción, configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_STORAGE_BUCKET`. Para un piloto local aislado se permite el backend privado en disco con `LOCAL_STORAGE_ROOT`, `LOCAL_STORAGE_SECRET` y `APP_URL`; sus URLs también son firmadas y vencen.
2. Ejecutar `npx prisma migrate deploy` como parte del despliegue.
3. Iniciar la aplicación con `npm run build` y `npm run start`.
4. Confirmar que la base no contiene instituciones y abrir `/setup`.

## Recorrido desde cero

### 1. Crear el espacio y el administrador

1. En `/setup`, registrar “Colegio Piloto”, el identificador `colegio-piloto`, un nombre y correo administrativos y una contraseña de 10 o más caracteres con letra y número.
2. Resultado esperado: aparece “Institución creada”; `/setup` deja de estar disponible y redirige a `/login` en visitas posteriores.
3. Iniciar sesión como administrador, cerrar sesión y volver a entrar. La institución y la cuenta deben persistir.

### 2. Configurar institución, personas, permisos y departamento

1. En **Configuración**, guardar nombre, tipo, dominio opcional, zona horaria e idioma.
2. Abrir **Puesta en marcha del piloto**. Crear exactamente una cuenta de docente, una de estudiante y una de tutor. Crear y activar un período académico.
3. Abrir **Roles y permisos**. Revisar la matriz; conservar para el docente `course.view`, `course.manage`, `course.roster.view` y `schedule.view`. Confirmar que el tutor no tiene `course.view`, `people.view` ni permisos institucionales.
4. Abrir **Departamentos y unidades**. Crear “Departamento Académico” y asignar al docente.
5. Resultado esperado: el checklist marca docente, estudiante, tutor, período y departamento. Cada cuenta puede iniciar sesión después de cerrar la sesión anterior.

### 3. Crear el curso como docente

1. Iniciar sesión como docente y abrir **Mis cursos**.
2. Elegir **Crear un curso**, seleccionar el período activo y registrar “Curso Piloto” con código `PIL-101`.
3. Abrir el curso. Crear una sección publicada, una lección publicada de tipo actividad y contenido de texto.
4. Crear el libro de calificaciones y una asignación publicada dentro de la categoría de asignaciones.
5. Resultado esperado: el docente solo ve y modifica `PIL-101`; no ve Configuración, Personas, Cobros ni cursos de otro docente/tenant.

### 4. Matricular y vincular como administrador

1. Volver a iniciar sesión como administrador, abrir `PIL-101` y usar **Matricular estudiante**.
2. En **Configuración → Tutores y estudiantes**, crear el vínculo tutor–estudiante con acceso a progreso, asistencia y avisos, sin finanzas. El vínculo debe nacer pendiente; activarlo explícitamente.
3. Resultado esperado: el checklist de puesta en marcha marca el vínculo activo. El tutor sin vínculo activo o con bandera desactivada no recibe el área correspondiente.

### 5. Actividad, asistencia, nota y progreso

1. Como docente, registrar asistencia del estudiante en `PIL-101`.
2. Como estudiante, abrir `PIL-101`, marcar la actividad/lección como completada y entregar la asignación.
3. Cerrar sesión y volver a entrar como estudiante. Confirmar que el progreso y la entrega persisten.
4. Como docente, calificar la entrega y publicar el período de notas.
5. Como estudiante, volver a entrar y confirmar que ve su progreso, asistencia y nota publicada, pero ningún nombre ni correo de compañeros.
6. Como tutor, entrar en **Mis hijos** y confirmar que ve exclusivamente el progreso, asistencia y notas publicadas del estudiante vinculado; no hay acceso directo a `/dashboard/aula`, Personas, Cobros ni datos institucionales no autorizados.

### 6. Anuncio segmentado y archivos persistentes

1. Como administrador, abrir **Avisos** y crear un anuncio con título, texto con negrita/lista, curso relacionado `PIL-101`, enlace HTTPS y una imagen o video permitido.
2. Seleccionar como audiencia el curso `PIL-101`, revisar y confirmar la publicación.
3. Resultado esperado: docente y estudiante del curso lo ven; el tutor lo ve únicamente por el vínculo activo y `canViewAnnouncements`; el autor/manager lo ve por su función administrativa. Una cuenta fuera de la audiencia no lo recibe.
4. Cerrar todas las sesiones y volver a entrar con cada rol. El anuncio, su formato, enlace y archivo deben persistir. La descarga usa una URL privada firmada después de autorizar usuario, tenant y audiencia.

## Pruebas negativas obligatorias

- Repetir una acción con un ID de usuario, curso, unidad, vínculo o archivo de otro tenant: debe responder no encontrado/sin acceso y no escribir nada.
- Abrir directamente rutas ocultas para tutor, estudiante y docente: debe devolver 404 o redirigir sin datos.
- Revocar el vínculo: el portal del tutor debe cortar inmediatamente nuevas consultas de cursos, asistencia, notas y anuncios. Una URL privada ya emitida puede seguir válida durante su TTL nominal de hasta 300 segundos; S1 debe medir ambos backends y reducir o mediar esa ventana según sensibilidad.
- Completar el curso: tareas, exámenes y progreso pasan a consulta y no admiten nuevas escrituras.
- Desactivar una capability del docente: navegación, página, acción y archivo deben aplicar la misma denegación.

## Puerta automatizada

```powershell
npx prisma validate
npx prisma generate
npm test
npm run test:auth
npm run typecheck
npm run lint
npm run build
git diff --check
```

El recorrido solo se declara aprobado si, además de esa puerta, se ejecutan los seis bloques en un entorno desplegado o equivalente con PostgreSQL y Supabase Storage reales. Un build verde sin autenticación, persistencia, archivos y cambio de sesiones no completa el MVP.


## Runner de aceptación en Preview

El Preview de la rama usa el Supabase staging de Edukana. El modo `existing` inicia sesión con un administrador vigente, confirma el slug institucional y ejecuta un preflight de solo lectura. Rechaza la ejecución antes de escribir si ya existen los correos, código de curso o unidad del run. Cada ejecución necesita un `PILOT_RUN_ID` nuevo, genera nombres exclusivos y reutiliza un período activo sin crearlo, desactivarlo ni editarlo.

Chromium incluido es el navegador predeterminado; `PILOT_BROWSER_CHANNEL=msedge` permite una aceptación local específica con Edge. El runner se niega a operar si el host no es un deployment Vercel Preview `-git-` confirmado dos veces. El bypass de Deployment Protection se añade únicamente a solicitudes HTTPS del host Preview confirmado y nunca a Supabase ni a otros orígenes.

```powershell
$env:PILOT_BASE_URL = "https://edukana-git-<rama>-<cuenta>.vercel.app"
$env:PILOT_EXPECTED_HOST = "edukana-git-<rama>-<cuenta>.vercel.app"
$env:PILOT_CONFIRM = "PREVIEW_ONLY"
$env:PILOT_MODE = "existing"
$env:PILOT_RUN_ID = "s0-<fecha-o-id-unico>"
$env:PILOT_INSTITUTION_SLUG = "demo"
$env:PILOT_ADMIN_EMAIL = "<administrador existente de Edukana>"
$env:PILOT_ADMIN_PASSWORD = "<contraseña del administrador existente>"
$env:PILOT_TEACHER_EMAIL = "<docente nuevo y exclusivo del run>"
$env:PILOT_STUDENT_EMAIL = "<estudiante nuevo y exclusivo del run>"
$env:PILOT_PARENT_EMAIL = "<tutor nuevo y exclusivo del run>"
$env:PILOT_USER_PASSWORD = "<contraseña temporal segura para las cuentas nuevas>"
# Solo si Vercel Deployment Protection está habilitado:
$env:VERCEL_AUTOMATION_BYPASS_SECRET = "<secreto de automatización de Vercel>"
npm run test:pilot:preview
```

`PILOT_HEADLESS=false` permite observar el recorrido. Las capturas y trazas de fallos se escriben en `$env:KIROCREW_SCRATCH`; no se guardan dentro del repositorio. `npm run test:pilot:config` valida las protecciones sin acceder a ningún entorno.

La cadena de migraciones desde una base vacía se valida por separado en PostgreSQL 16 temporal dentro de CircleCI. El modo `bootstrap` del runner se conserva para un entorno vacío controlado, pero nunca se ejecuta contra staging. El recorrido desplegado cubre los seis bloques principales, cambios de sesión, persistencia, restricciones de rutas y multimedia privada. Aún requieren una prueba separada: IDs pertenecientes a un segundo tenant y una cuenta activa fuera de la audiencia del anuncio.
