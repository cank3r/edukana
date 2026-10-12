# Evidencia del cierre canónico — 12 de octubre de 2026

Estado: aceptación incompleta. PR de trabajo #122; base de aplicación `ffaadff471c4c02341b31619dbef8956bf1b4896`.
No se integró ni desplegó este candidato. Preview/Supabase no se probaron de forma autenticada.

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
  la corrección limitada de Auth a las 19:43 UTC; escritor separado y QA independiente en curso.
  No se considera resuelto por esperar en el harness.
- Entrega/descarte concurrentes: control secuencial PASS y dos regresiones FAIL en PostgreSQL real,
  repetidas por el integrador. Entrega SUBMITTED sin contenido/archivos y objeto perdido. Prueba,
  condiciones y límites en [diagnóstico de persistencia](canonical-submission-races.md). Fix de Storage
  autorizado por Carlos a las 19:43 UTC; escritor separado y QA independiente en curso.

Guardas del harness22/22 y suite existente188/188 PASS con Node22. ESLint, tipos y build deben
revalidarse junto al SHA final. QA independiente revisó aislamiento/proyección pública, prueba de
persistencia y fix cliente. UX run06-ux01 y run07: 3 PASS/7 FAIL a 360/1280.
El ajuste CSS de áreas de 44 px está revisado e integrado en `f926e28`; su runtime sigue pendiente.
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
