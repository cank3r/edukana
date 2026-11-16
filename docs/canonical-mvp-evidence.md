# Evidencia del candidato canónico - 12 de octubre de 2026

Actualización del 13-oct: PR [#122](https://github.com/cank3r/edukana/pull/122) integrado como
`8115614be8f0870826deda18b1fe3d9a86b6e40e`; CI general y canónico del mismo SHA terminaron
correctamente, incluido el recorrido **23/23**. Preview actual READY sobre ese SHA, correo recibido
y login tutor confirmados por Carlos. **La aceptación completa permanece abierta**: véase la
[matriz actual y siguientes pasos](mvp-acceptance-20261013.md), que separa CI aislado de Preview/Supabase.

El resto del registro conserva el ensayo local histórico del 12-oct, cuya base de aplicación fue
`ffaadff471c4c02341b31619dbef8956bf1b4896`. Los pendientes anteriores a la integración no sustituyen
el estado actualizado anterior.

Último ensayo local histórico completo: **run10**, terminado `2026-10-12T21:01:59.08Z`, código
`2d8d9d22b3db815493b33fffaa01915bfa0bf22c`, árbol limpio al iniciar. Node 22.20.0,
PostgreSQL 16.4, Next 16.4 y Chromium de Playwright 1.64. Se creó un PostgreSQL nuevo y vacío;
se aplicaron las 16 migraciones existentes y los seis bloques académicos nacieron en la interfaz.
El flujo principal no usó seed, inserciones directas de cuentas, hashes ni sesiones preparadas.

## Resultado integrado

| Comprobación | Resultado real |
|---|---|
| Arranque vacío y seis bloques por UI | PASS |
| Cuatro roles a 360/1280: pantallas, controles, recarga y navegación | 8/8 PASS |
| Modal a 360/1280: Tab, Shift+Tab, Escape y retorno del foco | 2/2 PASS |
| Entrada directa, recarga abierta, Cerrar/Cancelar y Atrás/Adelante | 4/4 PASS; nota 92, comentario e historial conservados, cero intentos de escritura |
| Instituciones, roles, audiencia y privacidad entre compañeros | PASS con sesiones y peticiones reales |
| Mismo alumno COMPLETED: entrega nueva, reenvío, examen y progreso abiertos | Escrituras rechazadas; texto, ID, fecha, versiones, nota 92 e historia conservados |
| Docente sin course.view | Menú, página y acción deniegan; nuevas URLs propias devuelven 403; contenido intacto |
| URLs emitidas anteriormente | Vencen tras 60/300 segundos reales, sin adelantar el reloj |
| Tutor: banderas y revocación terminal | Nuevas consultas y autorizaciones denegadas; URL anterior vence realmente a 60 segundos |
| Logout inmediato y quiescente | Tres muestras de cada uno PASS |
| Carga de documento y vídeo desde UI | Confirmación 200 y bytes descargados idénticos |
| Build, TypeScript y lint del candidato final | PASS |

Guardas 22/22, Auth 5/5 y unitarias existentes 188/188 pasaron sobre `f66bdd3` en Node 22.
Los cambios posteriores sólo afectan el guard de visibilidad del diálogo y dos comparadores de
sus pruebas; build, tipos y lint se repitieron tras esos cambios. CI debe validar el SHA publicado.

En otro PostgreSQL exclusivo, el comando conjunto que utiliza CI pasó **16/16**: cuatro carreras
reales de entrega/descarte y doce regresiones de archivos. Las pruebas nuevas de propietario pasaron
de **9 PASS/3 FAIL** antes del cambio a **12/12 PASS** después. Veintiuna unidades de alcance,
avisos y Storage pasaron. Las 32 sondas de QA en memoria se registran aparte y no se cuentan como PG.

## Correcciones y revisión independiente

- [Auth](canonical-auth-logout.md): el proxy retira `Set-Cookie` tras Auth.js. Navegar deja de renovar
  la cookie; duración configurada y handlers explícitos se conservan. El handler `/api/auth/session`
  mantiene la carrera residual documentada: no se afirma revocación global de sesiones.
- [Atomicidad](canonical-submission-races.md): revalidar antes de borrar bytes y exigir el número
  exacto de archivos vinculados dentro de la transacción; un archivo ausente revierte la entrega.
- [Propietario](canonical-asset-owner-access.md): requiere alcance vigente del curso sin
  `announcementId`. Se preservan avisos, privados ajenos, ACTIVE/COMPLETED actuales e históricos,
  avatar/logo, rutas públicas y TTL. Carlos autorizó este contrato a las 20:21 UTC.
- [Diálogo](canonical-grade-dialog.md): `showModal`, foco, ciclo de teclado, Escape y retorno móvil.
  Handoff limitado de la página compartida; formulario, acciones, historial y formato intactos.
  PR114 sigue separado.
- [Lecciones](canonical-lesson-upload.md): enviar File crudo con su MIME; [UX](canonical-ux-review.md):
  controles de 44 px y tabla accesible sin desbordamiento.

QA independiente cotejó los commits y alcances sin hallazgos bloqueantes. Los últimos correctivos
revisados fueron `a8a6397` (diálogo) y `84e5d45` (comparadores); integrados en el SHA probado anterior.
Antes de run10, los seis casos focales del diálogo pasaron sobre los datos UI de run09 en
`run09-modal01`. Esa ejecución de lectura no se presenta como otro recorrido desde cero.

Inspección adicional a 360/1280: diálogo nativo modal, documento de 360/1280 px y panel de 360/512 px,
sin desbordamiento ni contenido vertical fuera de la ventana; cero intentos de escritura tras login.
Se inspeccionaron ambas capturas locales. No constituye una auditoría completa de accesibilidad.

## Historial de intentos conservado

| Ensayo | Bloques completos | Resultado y alcance |
|---|---|---|
| run02 | 1-2 | Falló selector de período |
| run03 | 1-3 | Falló selector de tutor |
| run04 | 1-4 | Entrega persistida; falló selector de relectura del bloque 5 |
| run05 | Ninguno | Logout intermitente volvió al dashboard tras signout 200 |
| run06 | 1-6 | 4 PASS/4 FAIL; árbol con cambios, `1ac260b`, terminó 19:19:08 UTC |
| run07 | 1-6 | 10 PASS/9 FAIL; `4f8a4e0` limpio, terminó 19:41:19 UTC |
| run08 | 1-6 | 16 PASS/3 FAIL; `8cd6847` limpio, terminó 20:07:22 UTC |
| run09 | 1-6 | 18 PASS/5 FAIL; `f66bdd3` limpio, terminó 20:51:24 UTC |
| run09-modal01 | No repite el core | 6/6 casos de lectura del diálogo PASS sobre `2d8d9d2` |
| run10 | 1-6 | 23/23 PASS; `2d8d9d2` limpio |

Run09 confirmó el arreglo de permisos del propietario y todos los gates de denegación/Auth.
Conserva un fallo real del retorno móvil y cuatro casos interrumpidos por dos comparaciones incorrectas
del nuevo harness. Error terminal exacto: `Error: browser exited 1; inspect the private run log.`
Una sonda DOM de Chromium confirmó que un enlace bajo `<details>` cerrado reporta un rectángulo
y `visibility: visible`, pero no admite foco. El guard ahora excluye ese contenido y permite reabrir
la ficha. Las pruebas comparan los spans numéricos exactos y usan la misma extracción `innerText`
para el historial; no se relajaron foco, visibilidad, persistencia ni prohibición de escrituras.

Los resultados anteriores siguen siendo evidencia histórica, no gates aprobados del candidato final.
El diagnóstico CDP inicial de logout era insuficiente y fue sustituido por observación pasiva y una
petición protegida nueva; no se resolvió la carrera añadiendo una espera al test.

## CI y manejo de evidencia

El workflow canónico exige Auth explícitamente y ejecuta las suites de atomicidad/uploads en otro
PostgreSQL del job, con concurrencia de archivos igual a uno. Checkout no conserva credenciales.
Se publica sólo `public/summary.json`; buzón, archivos, sesiones, logs y capturas privados quedan fuera.

CI remoto histórico sobre `c93b6b9`: canónico
[38300409593](https://github.com/cank3r/edukana/actions/runs/38300409593) terminó 13 PASS/6 FAIL;
CI existente [38300409553](https://github.com/cank3r/edukana/actions/runs/38300409553) pasó.
Ese SHA precede los arreglos Auth/Storage y no acredita el candidato nuevo. Los resultados del SHA
publicado se registrarán en el PR y en el handoff final; no se atribuyen resultados entre commits.

El backend local fue PostgreSQL desechable y Storage privado local. Correo ficticio interceptado,
sin entrega a proveedor. Las fixtures directas de integración están separadas del recorrido UI.
No se usaron secretos, cuentas, correo ni DB/Storage externos. Ninguna migración nueva ni reset.

## Preview y bloqueo de navegador históricos (12-oct)

Antes de la integración, la Preview de la base `ffaadff` estaba separada de este candidato:
`https://edukana-df71bathl-cerkanasrl.vercel.app`, deployment `dpl_5VRpXXdforsovpjzy7G616KgqSLs`.
La protección exige sesión Vercel existente. El runtime CUA falló exactamente con:

```text
node_repl kernel exited unexpectedly
MXC launcher: cannot locate required Windows platform directory: HRESULT 0x80070003
```

No se extrajeron cookies/credenciales ni se habilitó bypass. Se necesita acceso autorizado mediante
un navegador funcional; antes de datos nuevos, confirmar destino aislado y alcance exacto, sin seed,
reset ni alterar datos anteriores. Las pruebas locales no acreditan Supabase ni entrega real de correo.
Carlos conserva la aceptación final y la decisión de merge/deploy.
