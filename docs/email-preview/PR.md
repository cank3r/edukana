Los correos de notas presentan ahora el logo oficial de Edukana, la institución, un resumen de tarea/curso y el botón **Ver nota y comentarios**. Conservan marca blanca, destinatarios, disparadores, permisos, asunto, texto plano y remitente; la nota y los comentarios siguen dentro de la plataforma.

El HTML usa tablas, estilos inline, PNG oficial, texto alternativo y CTA VML condicional. El enlace de preferencias alcanza 15,64:1 sobre su fondo real. No cambian recuperación ni invitaciones.

Se corrige además el bloqueo del build retirando únicamente `export` de `AnnouncementCard` en Community. La función permanece local e idéntica; no hay consumidores externos. La regresión carga el módulo y renderiza la página real con fronteras simuladas: falla antes por el export y pasa después, conservando audiencia, controles y estado vacío.

## Vista previa revisable

![Correo de nota a 360 px](https://raw.githubusercontent.com/cank3r/edukana/m3/grade-email-design-20261014/docs/email-preview/grade-chromium-360.png)

[Escritorio](https://github.com/cank3r/edukana/blob/m3/grade-email-design-20261014/docs/email-preview/grade-chromium-1280.png) · [HTML portátil y fixtures](https://github.com/cank3r/edukana/tree/m3/grade-email-design-20261014/docs/email-preview) · [Evidencia y reproducción](https://github.com/cank3r/edukana/blob/m3/grade-email-design-20261014/docs/notification-email-design.md)

## Validación local — Node 22.20

- 33/33 focales: 29 de correo + 4 nuevas de Community; regresión roja/verde confirmada.
- 188/188 generales y 167/167 backoffice, sin skips; ESLint completo PASS.
- Build Webpack completo PASS, TypeScript y 20/20 páginas estáticas. Turbopack conserva un fallo local de proceso CSS en Windows; CI Linux verificará el build normal.
- 48/48 renders Chromium/Firefox revisados, 320/360/600/1280 px e imágenes bloqueadas. Sus cinco hashes de fuentes/assets siguen idénticos: no hay cambios de correo desde la revisión.
- Diff público revisado: fixtures sintéticos, sin datos personales reales, secretos ni archivos privados. Sin schema, migraciones ni conexiones a DB externas.

## Coordinación y límites

Base `todo/tanda-4` en `4add96a`; claim `M3-NOTIFICATION-EMAIL-DESIGN` publicado antes del fix (`08da73f`). Carlos autorizó subir el rediseño y corregir build el 14-oct, 21:05 UTC; relevo M1 limitado transmitido por el coordinador. [Tablero #30](https://github.com/cank3r/edukana/issues/30#issuecomment-6178593519).

CI por SHA y preview automática pendientes de verificar. `vercel.json` actualmente desactiva previews de ramas `m3/*`; no se cambia esa política ni se ordena despliegue manual sin autorización adicional. Gmail/Outlook reales, modo oscuro y carga remota del logo siguen sin probar. No correos externos, merge ni aceptación final del MVP.
