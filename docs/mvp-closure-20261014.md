# Instrucciones docentes y retirada de adjuntos — 14 de octubre de 2026

[PR126](https://github.com/cank3r/edukana/pull/126), rama `m3/mvp-closure-20261014`.
Base `todo/tanda-4`: `0328299577a5910e9dfc276daff68b64d608ef22`, que integra PR125.
Merge local de base `9f772625`: conflicto únicamente por inserción de claims en TEAM,
resuelto conservando todas las filas de ambas ramas.

## Correcciones y cesión

- La vista docente muestra las instrucciones ya autorizadas por el roster, con saltos de línea,
  ajuste de texto largo y explicación del caso vacío. React escapa el texto; no hay consultas nuevas.
- Durante la retirada de un adjunto pendiente quedan bloqueados la entrega y los controles que
  modifican archivos. Se muestra «Quitando archivo…». El guard síncrono evita doble retirada y
  envío implícito antes del siguiente render. Al terminar se recuperan los controles. Un error
  conserva el archivo y permite reintentar; 404 conserva el tratamiento previo de archivo ausente.
- Período ya era correcto: no cambia el componente ni la selección de períodos históricos.

Carlos confirmó expresamente ambas cesiones a las 22:55 UTC. El coordinador transmitió el handoff;
claim ampliado y publicado en `0b8984a6` antes de editar. Registro en
[PR114](https://github.com/cank3r/edukana/pull/114#issuecomment-6180329894) y
[PR80](https://github.com/cank3r/edukana/pull/80#issuecomment-6180330118).

Solo dos archivos de aplicación: `src/app/dashboard/aula/[courseId]/tareas/[assignmentId]/page.tsx`
y `SubmissionFiles.tsx` en esa carpeta. El resto son pruebas, configuración/workflow propios,
este documento y la fila propia de TEAM. No se incorporan otras piezas de PR114/80.
Acciones, endpoints, payloads, permisos, retención, schema, migraciones y políticas intactos.
PR125 se fusionó autorizado; **PR126 aún no tiene autorización de integración**.

## Evidencia local

Node 22.20.0, lockfile sin cambios, Chromium de Playwright 1.64.0.

| Prueba | Antes | Después |
|---|---|---|
| Render de páginas reales, fronteras simuladas | 4 PASS / 1 FAIL | **7/7 PASS**, añade vacío y escape de texto |
| UI real a 360/1280 px | 16 PASS / 2 FAIL | **28/28 PASS**, cero skips/flaky |
| Período funcional y accesible | 4/4 PASS | 4/4 PASS incluidos en UI |
| Suite general | — | **188/188 PASS** |
| Backoffice | — | **174/174 PASS**, incluye las siete nuevas |
| ESLint completo / TypeScript | — | **PASS / PASS** |

La UI verifica DELETE retenido, bloqueo de entrega/carga/selección, un DELETE ante doble clic,
envío implícito bloqueado, ID retirado ausente del payload posterior, selección vigente conservada,
error de red, HTTP503/reintento y HTTP404. Conserva subida PDF con bytes sintéticos por el cliente
real, confirmación/cancelación, exclusión de archivo anterior sin DELETE, teclado y controles de44px.
Render docente con CSS real: texto multilínea y URL larga, vacío y ausencia de desbordamiento.

Capturas `instrucciones-docente.png`, `retirada-en-curso.png` y `adjuntos-confirmacion.png` en ambos
tamaños. Inspeccionadas las instrucciones móvil/escritorio y la retirada móvil. El workflow
`MVP closure regression` repite render/UI y publica artifacts sintéticos. CI general ejecuta
integración PostgreSQL, build y smoke. Resultados terminales y enlaces del SHA final se registran
en PR126; nunca se infieren de las pruebas locales.

La evidencia roja previa está en [CI38647140075](https://github.com/cank3r/edukana/actions/runs/38647140075).
Las aserciones originales siguen activas, sin fallos esperados ni omisiones.

## Reproducción y límites

```sh
node --require ./tests/integration/stub-server-only.cjs --import tsx --test tests/platform-mvp-closure.test.ts
npx playwright install chromium
npx playwright test --config=playwright.mvp-closure.config.ts
npm test
npm run test:backoffice
npm run lint
npm run typecheck
```

Harness en loopback con GET solamente; sesión, DAL y acciones simulados explícitamente.
Página docente real renderizada con datos ficticios, sin sesión Next autenticada. Cliente de
upload real con HTTP interceptado. No usa cuentas, DB, storage ni correo externos.

No acredita login desplegado, aislamiento real entre cuentas/instituciones, persistencia de
formularios en PostgreSQL, proveedor privado, bytes remotos ni TTL de URLs. La aceptación
desplegada del MVP continúa abierta. No hubo nuevos correos de prueba.
