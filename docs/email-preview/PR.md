# Mejorar los correos de notas con la identidad de Edukana

Base: `todo/tanda-4`. Head: `m3/grade-email-design-20261014`. Borrador local, sin PR remoto todavía.

Los avisos de notas se recibían como párrafos separados y URLs largas, sin logo de Edukana ni una acción clara.
Esta propuesta presenta el logo oficial, la institución, el estado de la calificación, un resumen de tarea y
curso y el botón «Ver nota y comentarios». La nota y el feedback siguen dentro de la plataforma.

La composición se reutiliza para los demás tipos de notificación con su CTA propio. Usa tablas, estilos inline,
PNG derivado del SVG oficial y botón VML condicional; respeta colores institucionales, marca blanca, escape,
enlaces canónicos y fallback sin APP_URL. Se mantienen destinatarios, disparadores, preferencias, remitente,
asunto, texto plano y proveedor. Recuperación e invitaciones no cambian.

## Evidencia

- [Vista previa portátil](index.html), [móvil](grade-chromium-360.png), [escritorio](grade-chromium-1280.png).
- Validación inicial Node 22.20.0: npm test PASS; backoffice 162/162 PASS (11 nuevas).
- Ajuste de contraste tras revisión: preferencias usa navy sobre cloud; regresión roja a 4.23:1 antes
  del fix y 29/29 pruebas focales PASS después (12 plantilla, 12 marca/reset/invitaciones, 5 política).
- Regresiones existentes de marca, reset e invitaciones 12/12 PASS; tipos de fuentes, lint focal,
  Prisma generate/validate y diff-check PASS.
- Chromium/Firefox: 48/48 casos en 320/360/600/1280 px, incluidos textos largos e imágenes bloqueadas.
- Build: Turbopack falla en proceso CSS; Webpack compila, pero Next rechaza el export preexistente
  `AnnouncementCard` de `dashboard/comunidad/page.tsx`, idéntico a la base. No se declara build verde.

Gmail/Outlook reales y modo oscuro aún no probados. Sin emails enviados, publicación, merge ni deployment.
La revisión visual es previa a cualquier publicación, conforme a la instrucción de Carlos.
Detalles, límites y reproducción: [documento de evidencia](../notification-email-design.md).
