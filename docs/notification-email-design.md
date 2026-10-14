# Notificaciones por correo: diseño y evidencia local

Fecha: 2026-10-14. Rama: `m3/grade-email-design-20261014`.
Base y última comprobación remota: `4add96a752fa8a71e24a9bfe9395f2b0f1fafeea` (`todo/tanda-4`).

## Resultado para revisión

- [Abrir galería HTML portátil](email-preview/index.html).
- [Nota publicada](email-preview/grade.html), [nota corregida](email-preview/corrected.html),
  [marca blanca](email-preview/white-label.html), [aviso](email-preview/announcement.html),
  [nombres largos](email-preview/long.html).
- [Captura móvil de 360 px](email-preview/grade-chromium-360.png) y
  [escritorio de 1280 px](email-preview/grade-chromium-1280.png).
- [Imágenes bloqueadas](email-preview/images-blocked-chromium-360.png).
- [Medidas de los 48 escenarios](email-preview/render-evidence.json).

Los datos son ficticios. Las copias `.source.html` contienen el HTML que compone la aplicación, con URLs
de ejemplo. Las copias `.html` solo sustituyen la URL del PNG por sus bytes incrustados para poder revisarlas
sin red. Los emails enviados por la aplicación usan la URL HTTPS absoluta del origen institucional validado;
no usan data URI. Los enlaces de las muestras son de `example.test`, no de un curso real.

## Hallazgos y alcance

La plantilla anterior en `platform/branded-email.ts` convertía cada línea, incluidas las vacías, en un párrafo.
El título principal era el nombre institucional; los enlaces se mostraban completos; no había CTA ni resumen
del evento. El único logo posible era el institucional configurado, seguido de atribución textual a Edukana.

Se añade una presentación reusable **solo para notificaciones**. La integración en `notifications/index.ts`
cambia el compositor del mensaje, con el mismo destinatario, asunto y texto plano. El compositor existente sigue
resolviendo remitente, saneamiento de cabeceras y texto alternativo. Recuperación e invitaciones no se modifican.

El diseño usa tablas de presentación, ancho fluido máximo de 600 px, estilos inline, fuente de sistema,
botón HTML y alternativa VML condicional para Outlook clásico. El preencabezado no incluye nota ni comentarios.
El evento de nota conserva su política: esos datos solo se consultan en la plataforma autenticada.

La nota nueva y la corrección tienen titulares distintos. Tarea y curso se separan únicamente cuando el texto
coincide con el formato exacto que ya genera `notifyGradePosted`; textos desconocidos o truncados se conservan.
No se extraen URLs del cuerpo. Los CTA se definen por tipo: nota, aviso, tarea, entrega, examen, clase,
certificado y cuenta. El pie conserva el enlace a las preferencias existentes.

Sin cambios en eventos/disparadores, consultas de destinatarios, permisos, preferencias, límites de envío,
proveedor, schema, migraciones, dependencias ni configuración de despliegue. Tampoco se toca la plantilla
compartida o los tests reclamados de recuperación.

## Marca real

- Azul `#2457F5`, navy `#101B3F`, fondo `#F4F7FC` y blanco: `src/app/globals.css`.
- Color institucional validado por `ensureReadableOnWhite`, mínimo 4.5:1 con blanco.
- El enlace de preferencias usa navy sobre el fondo cloud; el color institucional se reserva para superficies blancas.
- Logo: `public/logos/edukana_horizontal_sin_firma.svg`, sin cambiar trazos ni colores.
- `public/logos/edukana_email.png`: derivado raster de 624 × 176 px, mostrado a 156 × 44 px.
  Se genera con `node scripts/render-email-logo.mjs` usando `sharp`, ya incluido en el lockfile por Next.
- `resolveWhiteLabel` conserva prioridad del booleano del plan sobre el ajuste legacy. Si es true, se omiten
  logo y atribución de plataforma y se mantienen nombre, logo y color institucionales configurados.
- Sin URL de aplicación válida se mantiene contenido legible y marca textual, sin enlaces o imágenes rotos.

## Pruebas iniciales del diseño (antes del relevo de Community)

Node oficial **22.20.0**, SHA256 contrastado con `SHASUMS256.txt` de nodejs.org. Prisma **5.22.0**.
No se abrieron archivos de credenciales ni se conectó ninguna base de datos real.

| Comprobación | Resultado |
|---|---|
| 12 pruebas nuevas `platform-notification-email.test.ts` | PASS; compositor real, entrega en memoria y contraste del enlace sobre su fondo real |
| Regresiones existentes `platform-branded-email.test.ts` | 12/12 PASS; reset, invitación, remitente, aislamiento, marca blanca y fallback |
| Política existente `notification-email-policy.test.ts` | 5/5 PASS |
| `npm test` (validación inicial) | PASS |
| `npm run test:backoffice` (validación inicial) | 162/162 PASS, incluidas las 11 pruebas nuevas iniciales |
| Regresión posterior de contraste + suites focales completas | 29/29 PASS: 12 plantilla, 12 marca/reset/invitaciones, 5 política |
| `tsc --noEmit` antes de generar el build | PASS |
| `tsc --noEmit` después del build | Solo el error del validador generado de Next para `AnnouncementCard`; sin errores nuevos en fuentes |
| ESLint focal de los cinco archivos TypeScript/JavaScript de este cambio | PASS |
| Prisma generate / validate | PASS; no migración ni conexión DB |
| `git diff --check` | PASS |
| Render local Chromium 156.0.8078.4 y Firefox 157.0 | 48/48 escenarios PASS |
| `npm run build` (Turbopack) | No completado: fallo al iniciar proceso de CSS de `globals.css` |
| `next build --webpack` | Compila en 17.8 s; gate de Next bloqueado por export existente `AnnouncementCard` en `dashboard/comunidad/page.tsx` |

El primer intento de build en sandbox no pudo descargar Inter de Google Fonts. El reintento con acceso de red
superó ese punto, pero encontró el fallo de proceso de Turbopack. Webpack compiló y después detectó el export de
página preexistente. En ese corte no se relajó TypeScript, modificó esa página ni cambió el bundler del proyecto.
El archivo señalado coincide byte a byte con la base (blob Git `0ca94a5111a0d65bb23ea0f72d00d8476cf614ad`).
En ese corte inicial el build completo **no estaba acreditado**; el relevo posterior se documenta abajo. No se excluyó el validador generado para presentar un resultado verde.

Las 48 comprobaciones visuales cubren cinco fixtures × cuatro anchos (320/360/600/1280) × dos motores,
más imágenes bloqueadas en cada ancho y motor. Verifican ausencia de overflow, logo cargado, un h1,
tablas presentacionales, preencabezado oculto, primer foco en CTA, CTA de 48 px y preferencias de 44 px.
El bloqueo de imágenes conserva texto alternativo, encabezado y CTA legibles. Todas las solicitudes del HTML
se interceptan: solo se sirven bytes del PNG local, el resto se aborta.

Las pruebas de entrega usan `MemoryEmailProvider`; comprueban la consulta vigente de personas activas de la
institución y cuentas activas, preferencia apagada y tope de 50. El evento real de nota, con fronteras de DB
simuladas, conserva destinatario estudiante, excluye score/feedback y no notifica una calificación oculta.
Esto **no equivale a una prueba PostgreSQL nueva**; la lógica de esos servicios no cambió.

La revisión independiente detectó que el enlace de preferencias heredaba un color institucional contrastado
contra blanco, aunque su fondo es cloud. La prueba nueva reproduce el fallo antes del ajuste: `#767676`
sobre `#F4F7FC` da **4.23:1**. Se cambia únicamente ese enlace a navy `#101B3F` (**15.64:1**), manteniendo subrayado,
destino y área táctil. La regresión lee foreground/background del HTML generado y exige al menos 4.5:1
para los colores institucionales `#767676`, `#24C8E5` y azul Edukana. Pasa después de la corrección,
junto con las 29 pruebas focales y los 48 escenarios visuales regenerados. No se repitió el build bloqueado
porque el ajuste no altera el problema preexistente documentado arriba.

## Reproducción

Desde la raíz del worktree, con Node 22 y las dependencias del lockfile instaladas:

```powershell
node scripts/render-email-logo.mjs
node --require ./tests/integration/stub-server-only.cjs --import tsx --test tests/platform-notification-email.test.ts tests/platform-branded-email.test.ts tests/integration/notification-email-policy.test.ts
node node_modules/playwright/cli.js install chromium firefox
node --require ./tests/integration/stub-server-only.cjs --import tsx scripts/preview-notification-email.ts --render
```

La opción sin `--render` genera solo HTML. No hay ruta de producción de preview ni botón de envío.

## Publicación autorizada y corrección de Community

Carlos aprobó publicar el rediseño, corregir el build y abrir PR el 14-oct a las 21:05 UTC.
Claim publicado antes de la nueva escritura en `08da73f`, con relevo M1 limitado por el coordinador;
base remota revalidada `4add96a`. [PR #125](https://github.com/cank3r/edukana/pull/125) hacia `todo/tanda-4`.

El único cambio de aplicación adicional retira la palabra `export` de `AnnouncementCard` en
`src/app/dashboard/comunidad/page.tsx`. No había importadores externos. La función, consultas,
UI y permisos conservan su contenido. Nueva `tests/platform-community-page.test.ts`, descubierta por
`test:backoffice`, carga el módulo real y renderiza la página con fronteras de sesión/DB simuladas.
Antes: 3/4 PASS y fallo por export no admitido. Después: 4/4 PASS, incluidos audiencia de destinatario,
controles de gestor y estado vacío. No es una prueba de autorización PostgreSQL.

Validación de este corte con Node 22.20.0:

- 33/33 focales: 29 de correo + 4 de Community, sin skips.
- `npm test`: 188/188; `npm run test:backoffice`: 167/167, sin skips.
- `npm run lint`: PASS completo.
- `next build --webpack`: PASS completo, TypeScript y 20/20 páginas estáticas.
- `next build`/Turbopack: persiste el fallo local de proceso CSS en Windows; CI Linux ejecutará el comando normal.
- Los cinco hashes de fuentes/assets del manifest visual coinciden: los 48 renders revisados siguen vigentes;
  el cambio de Community no requiere regenerarlos.
- Revisión del diff público: solo fuentes, pruebas, logo oficial y documentación/capturas con fixtures
  sintéticos `example.test`; sin archivos privados, secretos, schema ni migraciones.

CI y preview se comprobarán sobre el SHA publicado y quedarán enlazados en PR #125 y tablero #30.
La política vigente `vercel.json` desactiva `m3/*`; no se cambia sin una autorización acotada.
No se ordena un despliegue manual.

## Límites de aceptación

No se enviaron mensajes ni se inspeccionó el buzón. La publicación de la rama y del PR fue autorizada
después de la revisión visual. No se hizo merge ni despliegue manual. La base remota se revalidó sin cambios.

Gmail y Outlook reales, Outlook clásico/VML, clientes móviles nativos, modo oscuro y recepción de imágenes
desde el deployment siguen **sin probar**. El uso de inline y las propiedades elegidas se contrastó con
la [referencia oficial de CSS de Gmail](https://developers.google.com/workspace/gmail/design/css);
la documentación no sustituye una recepción real. La VML no se ejecuta en Chromium/Firefox.
Si el deployment mantiene protección de acceso, esa protección podría bloquear la carga remota del logo;
su disponibilidad pública debe verificarse tras autorizar la publicación.

Siguiente paso: revisión visual de Carlos y autorización para publicar la rama/claim y abrir el PR hacia
`todo/tanda-4`; revalidar base y claims antes de publicar. El borrador de PR está en
[email-preview/PR.md](email-preview/PR.md). Cualquier envío de prueba, despliegue o merge requiere autorización aparte.
