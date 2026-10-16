# Logo público de los correos — 16 de octubre de 2026

Base: `673bb72eec620ddf6a3290b8f394b70ef11e23e9`. Rama: `m3/public-email-logo-20261016`.

El logo construido desde APP_URL o el dominio institucional podía quedar detrás del SSO de Vercel. El GET anónimo de la preview devolvía 302 hacia SSO, no una imagen. La única modificación productiva está en `src/server/email/layout.ts`: el logo de Edukana usa el mismo PNG oficial, publicado previamente en el repositorio público y fijado a un commit completo:

https://raw.githubusercontent.com/cank3r/edukana/673bb72eec620ddf6a3290b8f394b70ef11e23e9/public/logos/edukana_email.png

GET anónimo sin cookies ni redirecciones: **200 image/png**, 15.507 bytes, 624×176. Coincide byte por byte con `public/logos/edukana_email.png`. SHA256 `966d1ae0ab908e19f78661fa9e51e404468fec1adb0622f7cb667a4439fa5721`.

La imagen se muestra a 156×44, conserva alt e inline CSS. Sin APP_URL también puede mostrarse el logo público; las acciones y preferencias sin origen siguen omitidas. `whiteLabel` sigue ocultando Edukana. Logos institucionales, CTA, preferencias, emisores, destinatarios, permisos, tokens y disparadores no cambian. `applicationEmailLink` conserva su validación de mismo origen. No se modifica proveedor, infraestructura, protección, schema ni migraciones.

## Verificación local

- 40/40 pruebas focales de plantillas y entrega; nuevas regresiones de origen público, dominio institucional, ausencia de APP_URL y conservación de enlaces.
- `npm test`: 188/188; `npm run test:backoffice`: 202/202; cero skips.
- `npm run typecheck`, `npm run lint` y `git diff --check`: PASS.
- Revisión independiente: 84/84 focales, sin bloqueantes; hash/PNG original confirmados.
- 76/76 renders transaccionales Chromium a 320/360/600/1280; 48/48 escenarios de notas Chromium/Firefox, incluidas imágenes bloqueadas. Scripts interceptan solo el logo público con los bytes locales; toda otra petición se bloquea.
- Los HTML y capturas se regeneraron en `transactional-email-preview/` y `email-preview/`. Los artefactos anteriores de notas correspondían al compositor previo a la extracción compartida; los regenerados usan el compositor vigente.

Comandos de render: `node --import tsx scripts/preview-transactional-email.ts --render --chromium=<ejecutable instalado>` y `node --import tsx scripts/preview-notification-email.ts --render --chromium=<ejecutable instalado> --firefox=<ejecutable instalado>`. Los argumentos opcionales no alteran la aplicación.

## Límites y cierre

La disponibilidad HTTP del PNG se prueba separadamente de los renders aislados. Estos no acreditan Gmail, Outlook, VML ni modo oscuro. La imagen depende del acceso público al repositorio GitHub; se fija el commit para evitar cambios silenciosos de marca.

CI Node22/PostgreSQL/build/smoke del SHA final, merge y deployment READY se registrarán en la descripción y checks del PR, preservando el SHA validado. No hay producción ni cambios de protección. La autorización del coordinador cubre PR y merge a todo/tanda-4 solo con CI verde y revisión sin bloqueantes, además de una sola muestra no operativa por el proveedor existente; su envío y estado se registran fuera del repositorio público.
