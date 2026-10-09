# Pieza F: avisos de Edukana

- Ruta: `/operador/avisos`; creación `/operador/avisos/nuevo`; edición y terminación `/operador/avisos/[announcementId]`.
- Operador: se relee `getOperatorEmail()` en cada página y acción. Servicios verifican también la lista permitida.
- Fechas del formulario explícitas en UTC; inicio inclusivo, fin exclusivo; sin fin permanece vigente. Terminar cancela también los programados, sin borrar evidencia.
- Audiencias: ALL todas las personas; ADMINS ADMIN/SUPER_ADMIN; INDEPENDENT ADMIN/SUPER_ADMIN/TEACHER en institución con `settings.kind=INDEPENDENT`. Estudiantes compradores no reciben avisos para docentes independientes.
- Texto simple, límites título 160 y mensaje 4000, render escapado por React. Crear/editar exige confirmar el alcance; terminar exige escribir el título.
- Auditoría atómica con la mutación, acciones `PLATFORM_ANNOUNCEMENT_CREATED/UPDATED/ENDED`, operador normalizado y antes/después. Repetir terminar no crea otro evento.
- Cierre por identidad global (`identityId`), fallback membresía (`userId`), y aviso en localStorage. Almacenamiento bloqueado permite cierre temporal; otra persona en el mismo equipo sigue viendo el aviso. Una edición conserva el cierre: para un mensaje nuevo crear un aviso nuevo.
- Correo opcional omitido.

## Ensamblaje reservado al integrador

1. Importar `PlatformAnnouncementBanner` de `@/components/platform/PlatformAnnouncementBanner` arriba del dashboard y pasar `{institutionId: user.institutionId, userId: user.id, role: user.role}` desde sesión viva.
2. Menú: Avisos de Edukana → `/operador/avisos`. Migas: `avisos` puede ya existir; no duplicar clave; `nuevo` ya puede existir también.
3. Agregar `tests/platform-announcements.test.ts` al script unitario. Pruebas PostgreSQL bajo `tests/integration/platform-announcements.test.ts` entran por glob existente.
4. Invocar `platformAnnouncementsSmoke(page, uniqueTag)` de `tests/e2e/smoke/platform-announcements.fragment.ts` en sesión operador; añadir capturas Tour. Invocar `platformAnnouncementsDeniedSmoke(page)` en sesión no operador.
5. Aplicar en CI desechable migración `20261010120000_backoffice_avisos`. No se ha ejecutado contra Supabase/staging/producción.

## Validaciones

Unitarias DB-free: límites temporales, cancelación futura, audiencias, validación de entrada y aislamiento localStorage. Integración PostgreSQL: permisos de los cinco servicios; crear/editar/terminar/auditoría; filtrado por sesión real y fechas; cancelación programada y rechazo de datos. El fragmento de navegador cubre CRUD, cierre persistente y tres entradas prohibidas.
