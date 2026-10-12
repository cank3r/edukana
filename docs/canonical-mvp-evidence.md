# Evidencia del cierre canónico — 12 de octubre de 2026

Estado: aceptación incompleta. PR de trabajo #122; base de aplicación `ffaadff471c4c02341b31619dbef8956bf1b4896`.
No se fusionó a la rama desplegada ni se desplegó este candidato. Preview/Supabase no se probaron de forma autenticada.

Último recorrido completo: **run08, 16 PASS / 3 FAIL**, terminado `2026-10-12T20:07:22.489Z`.
SHA probado `8cd68474ac51e9ac19a5b097b91876c968f8b380`, árbol limpio al iniciar.
Los seis bloques canónicos pasan. Los únicos fallos restantes son el modal de notas a 360/1280
y la emisión de nuevas URLs al propietario después de revocar `course.view`.
Auth y atomicidad de archivos están corregidos, integrados localmente y revisados; sus commits
todavía no están publicados. Último remoto del PR: `c93b6b9f41e92493e4a48856191872438da27d49`.

## Resultado del candidato integrado

| Comprobación | Resultado real |
|---|---|
| Arranque vacío y seis bloques por UI | PASS |
| Cuatro roles a 360/1280, controles, recarga y navegación | 8/8 PASS |
| Aislamiento entre instituciones, roles y audiencia | PASS |
| Mismo alumno COMPLETED: entrega, reenvío, examen y progreso rechazados | PASS; texto, ID, fecha y versiones conservados; nota92 e historia legibles |
| Tutor: banderas, revocación terminal y URL previa | PASS; nueva autorización denegada y TTL60 real |
| Logout inmediato y quiescente | PASS, tres muestras de cada uno |
| Carga UI de documento y video | PASS; confirmación200 y bytes descargados idénticos |
| Docente sin course.view | Menú/página/acción rechazan; contenido intacto; URLs previas vencen60/300; nuevas propias fallan con302 en vez de403 |
| Modal de nota | FAIL a360/1280: Tab, Shift+Tab, Escape y retorno del foco |
| Guardas / regresiones Auth / unitarias existentes | 22/22, 5/5 y188/188 PASS con Node22 |
| Lint, TypeScript y build integrados | PASS |
| Concurrencia Storage en PG dedicado / uploads existentes | 4/4 y8/8 PASS; QA independiente PASS |

Sonda adicional de accesibilidad tras run08: documento360/1280 respectivamente, una tabla
accesible con ocho encabezados de fila en ambos tamaños, cero escrituras posteriores al login.
Su primer arranque falló antes de abrir Chromium con
`TypeError: Cannot read properties of undefined (reading 'readManifest')`; se corrigió únicamente
la importación del script diagnóstico y la repetición pasó. No cambió la aplicación.

CI remoto anterior `38300409593` sobre `c93b6b9` terminó con13 PASS/6 FAIL. El resumen público
identifica admin360, dos modales, COMPLETED, capacidad docente y logout inmediato. No contiene
excepciones privadas; las causas se contrastan con reproducciones locales, sin inventar detalle
remoto. Ese SHA precede los fixes Auth/Storage. CI existente `38300409553` del mismo SHA: PASS.
El candidato local añade gates explícitos de Auth y concurrencia Storage, con PostgreSQL separado
para esta última; deben ejecutarse en CI tras revisar su publicación.

La autorización de atomicidad no incluye modificar permisos de lectura. La corrección del
atajo de propietario en `assetReadAccess` necesita aprobación adicional. El modal toca una página
de PR114 y necesita handoff explícito. Ambos tienen propuestas acotadas; no se han editado.

## PostgreSQL temporal y recorrido UI

Node22.20.0, PostgreSQL16.4, Chromium de Playwright1.64, Storage privado local.
Cada intento completo comenzó con un contenedor nuevo vacío; migraciones existentes y datos creados
por UI, sin seed ni inserción de cuentas, hashes o sesiones. Correo ficticio interceptado localmente.
URL exclusiva dentro del contenedor: `http://127.0.0.1:3160`.

| Ensayo | Bloques completados | Resultado global / límite |
|---|---|---|
| run02 | 1–2 | Falló selector de período |
| run03 | 1–3 | Falló selector de tutor |
| run04 | 1–4 | Entrega persistida; falló selector de relectura en bloque5 |
| run05 | ninguno | Logout intermitente devolvió dashboard tras signout200 |
| run06 | 1–6 | 4 pruebas PASS y 4 FAIL; no aceptación global |
| run07 | 1-6 | 10 pruebas PASS y 9 FAIL; no aceptación global |
| run08 | 1-6 | 16 pruebas PASS y 3 FAIL; candidato integrado, no aceptación global |

`run07` terminó a `2026-10-12T19:41:19.321Z` sobre
`4f8a4e0674e8e61667176112df12ec7c9f57d3e4`, con árbol limpio al iniciar. Pasaron
los seis bloques, rutas por rol, aislamiento entre instituciones con peticiones reales,
audiencia/privacidad entre compañeros, banderas y revocación terminal del tutor con caducidad
real de la URL anterior a 60 segundos. Siete fallos pertenecen a UX (controles, desbordamiento
y modal); dos pruebas negativas quedan incompletas por selectores de alertas/contenido.
COMPLETED y revocación de capacidad docente con TTL 60/300 todavía no tienen PASS global.
Las seis muestras de logout de este intento pasaron, lo que no invalida la carrera intermitente
reproducida en `run06-auth01`. CI existente del SHA `4f8a4e0` pasó en la ejecución `38298793302`.

El workflow canónico adicional falló antes de crear jobs en `38298791948`; usaba el contexto
`runner.temp` donde GitHub no lo admite (env de job). `d5f93cc` mueve la selección de directorio
a un paso del runner. El nuevo CI conserva todas las pruebas y está pendiente de resultado.

`run06` terminó a `2026-10-12T19:19:08.438Z`. Metadatos registrados:
SHA `1ac260b82dc24947a50c683adf4c457a2c974599`, árbol con cambios locales; aplicación aún sobre la base
indicada. El summary público conserva este hecho: no atribuir el resultado a un commit posterior.

En run06 pasaron el recorrido completo, rutas restringidas y audiencia/privacidad entre compañeros.
La cuarta prueba aprobada era el diagnóstico CDP, cuyo alcance insuficiente se detectó y documentó:
no acreditaba ausencia de carrera de sesión. Se sustituyó por observación pasiva y petición nueva.
Fallaron aislamiento entre instituciones (timeout del harness), preparación del examen (captura prematura
de la ruta `nuevo`), subida del archivo de lección (error real de formato) y restauración de bandera del
tutor (pendiente repetir con lectura persistida del control). Sus aserciones corregidas requieren ejecución.

## Defectos reproducidos y correcciones

- Lecciones: la UI envía multipart pero Storage local valida archivo crudo; apareció «El archivo recibido
  no coincide con la carga autorizada». Fix cliente limitado a File+MIME, revisado independientemente;
  Run07 confirmó por UI la subida de documento de texto y video, confirmación HTTP 200 y descarga
  con bytes idénticos, antes de que un selector posterior interrumpiera la prueba de capacidad.
  La revocación docente y TTL 60/300 siguen pendientes. No cambia API/proveedor.
- Logout `run06-auth01`: dos de tres muestras inmediatas fallaron; tres quiescentes pasaron. Una muestra
  observa signout200, cookie ausente, respuestas GET posteriores que emiten cookie y una petición nueva
  al dashboard autorizada200. No se guardan valores de cookies en sus metadatos. Carlos autorizó
  la corrección limitada de Auth a las 19:43 UTC; commit15b7b8e, QA independiente y run08 PASS.
  No se considera resuelto por esperar en el harness.
- Entrega/descarte concurrentes: control secuencial PASS y dos regresiones FAIL en PostgreSQL real,
  repetidas por el integrador. Entrega SUBMITTED sin contenido/archivos y objeto perdido. Prueba,
  condiciones y límites en [diagnóstico de persistencia](canonical-submission-races.md). Fix de Storage
  autorizado por Carlos a las 19:43 UTC; commitdcc8914, cuatro regresiones PG y QA PASS.

Guardas del harness22/22 y suite existente188/188 PASS con Node22. ESLint, tipos y build deben
revalidarse junto al SHA final. QA independiente revisó aislamiento/proyección pública, prueba de
persistencia y fix cliente. UX run06-ux01 y run07: 3 PASS/7 FAIL a 360/1280.
El ajuste CSS de áreas de 44 px está revisado e integrado en `f926e28`; su runtime pasó en run08.
El modal de notas solapa PR114 y requiere handoff separado. CI del candidato final sigue pendiente.

## Preview y aceptación humana

El Preview desplegado de la base `ffaadff` continúa separado de esta evidencia:
`https://edukana-df71bathl-cerkanasrl.vercel.app` (deployment `dpl_5VRpXXdforsovpjzy7G616KgqSLs`).
La protección exige sesión Vercel. El runtime CUA falló con:

```
node_repl kernel exited unexpectedly
MXC launcher: cannot locate required Windows platform directory: HRESULT 0x80070003
```

No se reintentó ciegamente ni se extrajeron cookies/credenciales o habilitó bypass.
Se necesita acceso existente autorizado mediante un navegador funcional. Antes de nuevos datos,
confirmar destino aislado y alcance exacto; sin seed/reset ni alterar datos anteriores. El backend
local no valida Supabase. Carlos conserva la aceptación final de usabilidad y cualquier integración.
