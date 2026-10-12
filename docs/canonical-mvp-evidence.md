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
  repetición HTTP/bytes pendiente al escribir este registro. No cambia API/proveedor.
- Logout `run06-auth01`: dos de tres muestras inmediatas fallaron; tres quiescentes pasaron. Una muestra
  observa signout200, cookie ausente, respuestas GET posteriores que emiten cookie y una petición nueva
  al dashboard autorizada200. No se guardan valores de cookies en sus metadatos. Fix de Auth pendiente
  de autorización de alcance; no se considera resuelto por esperar en el harness.
- Entrega/descarte concurrentes: control secuencial PASS y dos regresiones FAIL en PostgreSQL real,
  repetidas por el integrador. Entrega SUBMITTED sin contenido/archivos y objeto perdido. Prueba,
  condiciones y límites en [diagnóstico de persistencia](canonical-submission-races.md). Fix de Storage
  pendiente de autorización; no hay cambios de servicios.

Guardas del harness22/22 y suite existente188/188 PASS con Node22. ESLint, tipos y build deben
revalidarse junto al SHA final. QA independiente revisó aislamiento/proyección pública, prueba de
persistencia y fix cliente. CI del candidato final y revisión UX360/1280 siguen pendientes.

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
