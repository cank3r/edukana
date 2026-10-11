# Personas: directorio, datos y acceso

Corte de presentación sobre `todo/tanda-4`, base `3e6d2b18a3bf1939584c053ce199623eff50ed7d`. Rama `m1/personas-ux-corte-a-20261011`.

## Comportamiento

- Directorio con filtros explícitos, ancho adaptable y una sola acción secundaria por persona. Buscar inicia en la primera página; las fichas conservan búsqueda, rol, estado y página al volver.
- Datos personales y acceso separados. Editar aparece en Datos; correo inmutable; cancelar vuelve a valores persistidos y los rechazos conservan el borrador.
- El alta presenta un resumen antes de crear o enviar una invitación. Suspender, reactivar y enviar correo requieren confirmación. Escape/cancelar no ejecutan acciones y devuelven el foco.
- Los estados distinguen actividad institucional de contraseña registrada. Un enlace vigente no demuestra entrega de correo. Reactivar una membresía no promete reactivar una identidad suspendida.
- SUPER_ADMIN no se sustituye por otro rol al editar: el editor explica que ese rol aún no está admitido. Los demás controles reflejan los permisos existentes del actor.
- El envío por lotes dice expresamente que abarca a todos los pendientes de la institución. Evita duplicar el envío, conserva un error honesto si se interrumpe y acepta el conteo actualizado tras importar.

No cambian consultas, servicios, políticas de autorización, contratos compartidos, esquema ni migraciones. La ficha académica agrega un guard de sesión ausente antes de las consultas. El parche de recuperación de contraseña permanece en otro worktree.

## Límites deliberados

- El directorio conoce la presencia de identidad y contraseña, pero no su estado global ni el historial del correo: no afirma «Puede entrar».
- El contrato de la ficha no expone presencia de identidad. La invitación individual se gestiona desde el directorio; no se añade una consulta para inferirla.
- La consulta del directorio no demuestra qué estudiantes pertenecen a cada docente. Un docente con acceso al directorio abre su propia ficha y consulta estudiantes desde sus cursos. La autorización del servidor permanece intacta.
- La segunda pantalla de importación/accesos conserva su consulta y límite existentes. Cambiar ese flujo o ampliar estados exige otro corte.

## Verificación local

| Comprobación | Resultado |
|---|---|
| `npm test` | PASS: 170, incluidos 33 casos nuevos de directorio, navegación y fichas |
| `npm run test:backoffice` | PASS |
| `npm run lint` | PASS |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS |
| `prisma validate` y `prisma generate` | PASS |
| `npm run build` | PASS con configuración ficticia local |
| `npm audit --omit=dev --audit-level=high` | PASS: 0 vulnerabilidades |
| Integración Personas (access/create/detail/import) | PASS: 35, en PostgreSQL 16.4 efímero ligado a 127.0.0.1, reloj fijo 2026-10-11T12:00Z y MemoryEmailProvider |
| `git diff --check` | PASS |
| Revisión independiente | PASS después de corregir el permiso de administrador en ficha y conteo/foco del envío masivo |
| Navegador de componentes 360/1280 | PASS: 20/20, Chrome headless con perfil efímero y acciones simuladas |
| Preview autenticado y Back/Forward del navegador de la aplicación completa | NOT RUN en este corte local |

El contenedor temporal se eliminó al terminar. Ninguna prueba usó Supabase, datos demo, sesiones de usuario ni correo real. La instalación local utiliza Node 24.14.0; CI utiliza Node 22, como declara el repositorio.

La aserción antigua de seguridad que dependía de la posición de `<section>` se sustituyó por pruebas de render y consulta: sin `finance.manage` no hay lectura de pagos ni sección Cuenta; con permiso se conserva el alcance institución/estudiante. El smoke de alta ahora recorre Revisar y confirma Agregar sin enviar correo.

## Fixture de navegador reproducible

```sh
npm ci
npx playwright test --config=playwright.people.config.ts
```

En Windows usa Chrome instalado con un perfil efímero; en otros sistemas requiere Chromium de Playwright. El servidor escucha solamente en `127.0.0.1:3147`. Importa AddPerson, PersonActions e InvitePending reales y el CSS de la aplicación. Sustituye únicamente los límites de acciones/navegación por adaptadores de prueba. El bundle rechaza módulos de servidor/base/auth y el navegador bloquea destinos externos. El fixture no es una captura del Preview ni comprueba toda la navegación de Next.

Los artefactos locales quedan en `../personas-ui-artifacts/`. Se detectó y corrigió desbordamiento con nombres continuos largos; la nueva aserción compara scrollWidth con clientWidth, incluso en móvil. Las capturas finales de los componentes se inspeccionaron a 360 y 1280 px. El reporte es `../personas-ui-artifacts/report/index.html` y la evidencia final se conserva en `../personas-ui-artifacts/complete-pass/` (capturas y results.json).

El navegador integrado CUA falló antes de navegar con el error exacto: `trusted Node process exited unexpectedly; kernel reset, rerun your request`. Playwright constituye una verificación local independiente, no una sesión recuperada del Preview.

La primera suite completa detectó 16/20 PASS: el select de rol se restablecía después de una acción rechazada y el test de doble clic exigía un foco que el segundo clic nativo mueve. Se corrigió el envío explícito de la acción para conservar el select; el test mantiene cero invocaciones tras doble clic y comprueba foco con clic simple. La repetición final pasó 20/20. Los rechazos de red para editar, suspender, invitar, crear y enviar lotes conservan datos y no duplican acciones.

## Siguiente paso

Revisar el PR borrador y el resultado de CI; después recorrer Personas en un Preview autorizado con Carlos. No se fusiona ni despliega manualmente como parte de este corte.
