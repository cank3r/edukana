# Correos transaccionales de Edukana

Fecha: 2026-10-16. Base: `463625296f3393e2aeb7b5e5f659f64f13a89489`.
Rama: `m3/transactional-email-local-20261016`.

## Resultado y alcance

Las invitaciones, recuperación, catálogo y ocho familias de notificaciones usan
una composición visual común. Se reutilizan el logo oficial existente
`public/logos/edukana_email.png` y los colores del producto: azul #2457F5,
navy #101B3F y cloud #F4F7FC. No se alteró el asset ni se inventó marca.

Los cuatro emisores se conectaron tras el relevo visual explícito de Carlos
(Sentinel_79ea0fe01d8c81918349b05b9ed70e7a), registrado antes de editar en el
commit `0e0e912`. La publicación de rama y PR hacia `todo/tanda-4` está autorizada
por Sentinel_55e3c409919c8191bfe86bba8841f68f. No incluye merge ni despliegue.
La comprobación de 23 checkouts encontró un diff antiguo de recuperación en
`edukana-demo-safe`; ese checkout no se modificó ni se incorporó su contrato.

| Familia | Variantes y resultado | Emisor conservado |
|---|---|---|
| Invitación | Crear contraseña, 7 días/uso único; cuenta existente solo login; recuperación secundaria | people/invitations.ts |
| Recuperación | Institución o contexto neutro; 60 minutos/uso único; aviso si no se solicitó | password-reset.ts |
| Catálogo | No estudiante: contactar; pedido: curso/número/total/instrucciones; ya inscrito: login sin pagar | catalog/checkout.ts |
| Notificaciones | Aviso, tarea, entrega, nota, examen, clase, certificado, cargo; CTA específico y preferencias | notifications/email-template.ts |

`enrollment` sigue siendo solo in-app. Altas administrativas, importaciones,
inscripción gratuita y confirmación de pedidos reutilizan invitaciones; no se
activaron nuevos disparadores ni tipos de correo.

## Diseño y contratos

`src/server/email/layout.ts` centraliza tablas fluidas hasta 600 px, estilos inline,
tipografía de sistema, jerarquía, resumen, CTA y pie. Hay un h1, preheader oculto,
alt del logo, enlaces de 44 px o más y botón VML para Outlook clásico. El HTML conserva
idioma español. `links.ts` admite solo HTTPS del origen validado o HTTP local;
rechaza credenciales, caracteres de control, protocolos inseguros y cruces de origen.

El nombre/logo/color institucional y prioridad del plan se conservan. Marca blanca
oculta la atribución de Edukana en HTML, texto de invitación y nombre visible del
remitente; este último es un cambio de presentación deliberado. No cambia el buzón
configurado. La invitación construye ambas alternativas desde campos explícitos;
no extrae tokens ni URLs del texto. El resto conserva el contenido transaccional.

La integración modifica solo imports y construcción de mensajes en los cuatro
archivos autorizados. Tokens, hashes, vencimientos, destinatarios, permisos,
preferencias, consultas de elegibilidad, limpieza, auditoría y etapas de recuperación
permanecen en sus rutas originales. El catálogo consulta marca completa por ID
sin alterar el selector público y conserva el envío original en texto si no puede
cargar/componer la marca. Su login usa el origen de plataforma anterior; las
instrucciones de pago se escapan como texto y no se convierten en enlaces nuevos.

## Verificación

- Node 24.14.0 local; el proyecto declara Node 22. CI verificará su versión declarada.
- 16/16 pruebas de composición y 10/10 nuevas de emisores con proveedor en memoria.
- 29/29 regresiones de marca, notificaciones y política, incluyendo privacidad de notas.
- 188/188 pruebas generales; TypeScript completo y lint focal PASS. Build Webpack PASS (20/20 páginas).
- La auditoría independiente final no encontró bloqueantes: 82/82 focales PASS
  (26 nuevas, 29 de correo/política y 27 de observabilidad). Confirmó las aserciones intactas.
- Detectó cuatro fallos (196/200 PASS) del doble antiguo en platform-password-reset-observability:
  omite helpers del compositor y falla prematuramente en message_build. Su ajuste
  quedó corregido con un doble explícito de resetEmail (tres líneas), tras el relevo
  Sentinel_d4dd131be180819184b8b852a8531272. Todas las aserciones siguen intactas.
  Suite backoffice final: 200/200 PASS, cero fallos u omisiones.
- 76/76 renders Chromium 155.0.8059.12: 19 fixtures por 320/360/600/1280 px, sin overflow,
  links >= 44 px, un h1, tablas de presentación, preheader oculto, alt y foco de teclado.
- 38 capturas PNG, HTML fuente, copias portátiles con enlaces inertes y texto plano.
  `transactional-email-preview/index.html` es la galería; `render-evidence.json`
  guarda medidas. Se inspeccionaron invitación móvil, nota móvil, pedido escritorio,
  marca blanca y estado sin origen/logo.
- Todas las solicitudes del renderer se abortan o reciben el PNG local; no hay red.

Los renders de navegador no acreditan Gmail, Outlook real, VML ni modo oscuro.
No se enviaron correos ni se abrió una base real desde la ejecución local. El resultado
terminal de CI se registra en la PR para su SHA exacto; no se infiere de pruebas
locales. Vercel mantiene desactivada esta rama; no se modifica esa política.

## Reproducir

```powershell
node --require ./tests/integration/stub-server-only.cjs --import tsx --test tests/platform-transactional-email*.test.ts
npm run test:backoffice
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --require ./tests/integration/stub-server-only.cjs --import tsx scripts/preview-transactional-email.ts --render
```

El render acepta `--chromium=RUTA_ABSOLUTA` para un navegador instalado. Todos los
datos de la galería son sintéticos, con dominios `.example.test` y tokens FICTICIO.
No hay ruta productiva, botón de envío ni archivo de credenciales en los fixtures.
