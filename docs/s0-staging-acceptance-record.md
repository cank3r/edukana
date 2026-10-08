# S0-12 — Registro de aceptación aditiva sin borrar staging

**Staging es el entorno demostrativo de Edukana y conserva todos sus datos.** S0-12 ejecuta el recorrido con un administrador existente y un namespace nuevo dentro de la institución allowlisted. No resetea, vacía, borra ni sobrescribe datos previos. La instalación desde cero se valida por separado en PostgreSQL temporal de CI.

## 1. Identidad allowlisted

| Recurso | Valor aprobado |
|---|---|
| Supabase project ref de staging Edukana | `xbjtwhpabntygxlzxpcl` (confirmar nuevamente antes de ejecutar) |
| Institución / slug esperado | `demo` o el slug confirmado por el administrador |
| Bucket privado de staging | `edukana` |
| Proyecto Vercel | `cerkanasrl/edukana` |
| Rama Preview | `feat/edukana-real-mvp` |
| Alias Preview | Se registra al ejecutar |
| SHA candidato | Se registra al ejecutar |
| `PILOT_RUN_ID` | Nuevo y único; se registra al ejecutar |

No copiar `DATABASE_URL`, `DIRECT_URL`, claves de Supabase, tokens de Vercel ni contraseñas. El runner verifica el slug desde la interfaz después del login y aborta antes de escribir si detecta colisiones del run.

## 2. Autorización requerida

La autorización del propietario acepta expresamente solo:

- Usar el Preview conectado al staging Edukana existente.
- Iniciar sesión con una cuenta administrativa aprobada sin guardar su contraseña.
- Crear tres usuarios ficticios, una unidad, un curso y sus artefactos con un `PILOT_RUN_ID` nuevo.
- Reutilizar un período activo existente sin cambiar su estado ni sus datos.
- Ejecutar escrituras funcionales del E2E y cargar un PNG privado exclusivo del run.
- Usar el bypass de automatización solo en el Preview identificado.
- Conservar todo lo creado como material demostrativo; cualquier limpieza futura requiere autorización separada.

- **Autorizado por:** PENDIENTE
- **Fecha/hora UTC:** PENDIENTE
- **Texto o enlace de autorización:** PENDIENTE

## 3. Preflight obligatorio

Registrar sin secretos:

- [ ] HEAD local, rama del PR y deployment Vercel apuntan al mismo SHA.
- [ ] Árbol Git limpio.
- [ ] CircleCI y Vercel verdes para ese SHA.
- [ ] PostgreSQL temporal de CircleCI aplicó todas las migraciones desde cero.
- [ ] El Preview usa el proyecto Supabase staging de Edukana, nunca producción.
- [ ] La cuenta administrativa inicia sesión y `/dashboard/configuracion` muestra el slug allowlisted.
- [ ] Existe al menos un período activo; el runner solo lo selecciona.
- [ ] `PILOT_RUN_ID`, correos, código de curso y nombre de unidad son nuevos.
- [ ] El bucket `edukana` sigue privado.
- [ ] La institución demo y sus páginas principales están accesibles antes del E2E.

El runner llama al endpoint autenticado y de solo lectura `/api/pilot-preflight`, que consulta PostgreSQL exactamente por slug, período activo, tres correos, unidad, nombre y código de curso dentro del tenant de la sesión. Aborta ante cualquier discrepancia o colisión. No ejecutar SQL manual, migraciones, reset, eliminación ni limpieza de Storage sobre staging.

## 4. Ejecución autorizada

Desde el checkout limpio del SHA candidato, apuntando exclusivamente al Preview de Edukana:

```powershell
git rev-parse HEAD
git status --short
npm run test:pilot:config
$env:PILOT_MODE = "existing"
$env:PILOT_RUN_ID = "s0-<id-nuevo>"
npm run test:pilot:preview
```

No ejecutar `prisma migrate deploy`, `prisma migrate reset`, SQL manual, comandos de borrado ni limpieza de Storage contra staging. Las credenciales se cargan como variables de proceso y nunca se imprimen o guardan en el repositorio.

## 5. Evidencia

| Evidencia | Resultado |
|---|---|
| SHA ejecutado | PENDIENTE |
| Deployment/alias | PENDIENTE |
| Fecha/hora UTC | PENDIENTE |
| Project ref y slug de staging verificados | PENDIENTE |
| `PILOT_RUN_ID` | PENDIENTE |
| Migraciones desde cero en PostgreSQL CI | PENDIENTE |
| Preflight sin colisiones | PENDIENTE |
| Período activo conservado | PENDIENTE |
| Bucket privado verificado | PENDIENTE |
| Resultado Playwright | PENDIENTE |
| Datos demo anteriores accesibles | PENDIENTE |
| Ruta de trazas/capturas en `KIROCREW_SCRATCH` | PENDIENTE |

## 6. Límites y conservación

- Staging y su Storage no se resetean, vacían, sobrescriben ni borran.
- El runner nunca crea o desactiva períodos en modo `existing`.
- Cada ejecución usa un `PILOT_RUN_ID`, tres correos y un código de curso nuevos.
- Los artefactos del recorrido se conservan como datos demostrativos identificables.
- Una repetición con el mismo namespace debe abortar en el preflight antes de escribir.
- Las migraciones desde cero ocurren únicamente en PostgreSQL temporal de CI.
- Revertir Vercel no cambia datos de la base.
- El recorrido actual no sustituye las pruebas separadas de segundo tenant y destinatario externo.

## 7. Resultado final

- [ ] **PASS:** recorrido completo desplegado, persistencia, permisos y archivo privado verificados.
- [ ] **FAIL:** registrar paso, error, traza y si el entorno quedó utilizable.
- [ ] **ABORT:** identidad o autorización insuficiente; no ejecutar escrituras.

**Conclusión:** PENDIENTE
