# Logout y respuestas tardías del proxy

Base: `d5f93cc679b8ab0b0097acb89b1699c651655436`, claim `MVP-AUTH-LOGOUT`.
Carlos autorizó este alcance el 12-Oct-2026. No incluye merge ni despliegue.

## Problema observado

La ejecución pasiva `run06-auth01` reprodujo dos fallos entre tres cierres de
sesión inmediatos; los tres cierres tras quedar la red inactiva pasaron. En la
muestra `logout-inmediato-3-metadata`, la secuencia 216 terminó el POST de logout
sin cookie de sesión. Las respuestas GET 217–220 de aula, comunidad,
notificaciones y perfil emitieron después una cookie de sesión. La secuencia
267 estaba en login con cookie presente; una petición nueva a dashboard obtuvo
200 en 280 y la navegación nueva volvió al dashboard. Solo se inspeccionaron
nombres, atributos y orden, sin valores de cookies. Run07 no reprodujo el fallo
en sus tres muestras inmediatas: la carrera es intermitente.

El wrapper real `nextAuth.auth` lee la sesión y añade a su respuesta las cookies
producidas por Auth.js. La estrategia JWT vuelve a firmar el token al leerlo.
Una navegación iniciada antes del logout puede terminar después y restaurar
esa cookie. El intento anterior con pausa CDP en fase de respuesta no descarta
la carrera: el navegador puede haber procesado las cookies antes de esa pausa.

## Cambio y política resultante

`src/proxy.ts` espera el resultado de `navigate` y retira su cabecera
`Set-Cookie`. Se mantienen el cuerpo, estado, redirecciones y cabeceras de
petición saneadas. También se retiran todas las partes de cookies divididas.
El proxy sigue leyendo la sesión únicamente para navegación; la autorización
viva continúa correspondiendo a las páginas, acciones y APIs.

Los handlers que se ejecutan después del proxy conservan sus propias cookies:
login, logout y renovación o cambio de institución explícitos. No se modifica
`src/lib/auth.ts`, `sessionVersion`, el plazo configurado por
`SESSION_MAX_AGE_DAYS` ni sus siete días predeterminados. Navegar deja de
prolongar por sí solo la caducidad del token almacenado por el navegador; la
caducidad vuelve a avanzar cuando se renueva explícitamente. El proxy tampoco
borra cookies inválidas: sigue denegando su acceso y los handlers pueden
limpiarlas.

Esto no implementa revocación global de JWT ni cierra todas las carreras de
Auth.js. Una petición explícita a `/api/auth/session` que ya estaba en curso
puede renovar la cookie desde su handler después del logout. Si se incorpora
polling de sesión o se requiere revocación en servidor, será un cambio de
política independiente. Invalidar `sessionVersion` afectaría a otras sesiones
de la identidad y queda fuera de este alcance.

## Pruebas realizadas

Node `22.20.0`, Next `16.4.0`, Auth.js `5.0.0-beta.32`, en contenedor propio
`node:22.20-bookworm-slim`, sin red, con checkout y dependencias montados en
solo lectura. No se ejecutó navegador, base de datos, Preview, seed ni migración.

`tests/auth-proxy-logout.test.ts` usa el wrapper, cifrado JWT, CSRF y handlers
reales de Auth.js, con configuración y credenciales públicas ficticias. El
resolver del host se sustituye por una fixture; no carga el cliente de DB.
La misma versión final de las fixtures y handlers tuvo tres fallos y dos
aciertos contra el proxy anterior; el caso concurrente falló porque el almacén
recuperó la cookie después del logout. Restaurado únicamente el fix del proxy,
los cinco casos pasan:

- Cuatro respuestas autenticadas se retienen mediante una barrera después de
  leer el JWT; el handler real cierra sesión; se liberan las respuestas y un
  almacén de cookies en memoria comprueba que la sesión no reaparece. La nueva
  petición protegida se redirige a login. No depende de esperas arbitrarias.
- Navegación, prefetch y paso por rutas API no emiten cookies desde el proxy,
  incluida una sesión dividida en varias cookies.
- Se conservan callbackUrl, origen real, saneamiento de cabeceras y rechazo de
  autoridad mal formada.
- Un token de otra institución sigue recibiendo redirección sin renovación.
- Los handlers reales siguen emitiendo login, renovación GET, actualización
  explícita y borrado al cerrar sesión; conservan el maxAge de la fixture.

La última prueba verifica los mecanismos de Auth.js con callbacks ficticios;
no pretende probar por sí sola la selección de membresía de la aplicación.
Las pruebas existentes `platform-host-auth.test.ts` y
`platform-host-boundaries.test.ts` cubren esa política con sus propias fixtures.
Resultado conjunto: **18/18 PASS**. Lint focal y comprobación completa de tipos
(`tsc --noEmit --incremental false`): **PASS**.

Comandos dentro del contenedor:

```sh
node --import tsx --test --test-reporter spec tests/auth-proxy-logout.test.ts
node --import 'data:text/javascript,globalThis.prisma={}' --import tsx --test --test-reporter spec tests/auth-proxy-logout.test.ts tests/platform-host-auth.test.ts tests/platform-host-boundaries.test.ts
node node_modules/eslint/bin/eslint.js src/proxy.ts tests/auth-proxy-logout.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

La suite existente de host importaba incidentalmente Prisma. Su primer intento
en la imagen slim terminó con `PrismaClientInitializationError` y
`libssl.so.1.1: cannot open shared object file: No such file or directory`.
El segundo comando preinstala un objeto DB vacío exclusivamente en los procesos
de prueba, para impedir esa inicialización; ninguna consulta queda simulada
como exitosa. La prueba nueva pasa sin ese preload. No se cambió la imagen ni
el entorno de aplicación.

## Pendientes del integrador

Actualización del integrador: QA independiente definitivo PASS para `15b7b8e`.
Run08 integrado sobre `8cd68474ac51e9ac19a5b097b91876c968f8b380`, limpio al iniciar,
pasó login/logout y las tres muestras inmediatas más tres quiescentes contra handlers reales.
Regresión dedicada5/5 y suite existente188/188 PASS con Node22, lint/tipos/build PASS.
El workflow local ya incluye la regresión explícita; publicación y ejecución de ese CI siguen
pendientes de revisión. El límite del handler explícito `/api/auth/session` descrito arriba permanece.

La ejecución explícita de la prueba nueva en CI (el
`npm test` actual enumera archivos y no la descubre) y repetición del flujo
desplegado siguen pendientes. El integrador controla ese runtime. Esta evidencia no constituye aceptación del
Preview ni aprobación de Carlos del recorrido final.
