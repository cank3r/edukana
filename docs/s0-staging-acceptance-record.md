# S0-12 — Registro de aceptación aislada sin borrar staging

Este archivo conserva su ruta para no romper enlaces existentes. **Staging contiene datos ficticios de demostración y no se resetea, vacía ni borra antes de producción.** S0-12 se ejecuta en un entorno de aceptación nuevo, separado de staging y producción. El registro identifica ese entorno y conserva evidencia sin copiar secretos.

## 1. Identidad allowlisted

| Recurso | Valor aprobado |
|---|---|
| Supabase project ref de aceptación | PENDIENTE |
| Host PostgreSQL de aceptación | PENDIENTE |
| Nombre de base de aceptación | PENDIENTE |
| Bucket privado exclusivo | `edukana` o nombre aprobado |
| Proyecto Vercel | `cerkanasrl/edukana` |
| Rama Preview | `feat/edukana-real-mvp` |
| Alias Preview | Se registra al ejecutar |
| SHA candidato | Se registra al ejecutar |

Los recursos de aceptación no pueden coincidir con producción ni con staging demostrativo. No copiar `DATABASE_URL`, `DIRECT_URL`, claves de Supabase, tokens de Vercel ni contraseñas.

## 2. Autorización requerida

La autorización del propietario debe aceptar expresamente solo:

- Crear o asignar recursos nuevos de aceptación, con costo informado si aplica.
- Aplicar migraciones desde cero sobre la base nueva, sin seed.
- Escrituras del E2E y carga de un PNG al bucket privado exclusivo de aceptación.
- Uso del bypass de automatización solo en el Preview identificado.
- Conservar staging y Storage de staging sin ninguna eliminación.
- Conservar también el entorno de aceptación después de la prueba; cualquier limpieza futura requiere autorización separada.

- **Autorizado por:** PENDIENTE
- **Fecha/hora UTC:** PENDIENTE
- **Texto o enlace de autorización:** PENDIENTE

## 3. Preflight obligatorio

Registrar sin secretos:

- [ ] HEAD local, rama del PR y deployment Vercel apuntan al mismo SHA.
- [ ] Árbol Git limpio.
- [ ] CircleCI y Vercel verdes para ese SHA.
- [ ] Revisión independiente aprobada para ese SHA.
- [ ] `DATABASE_URL` y `DIRECT_URL` coinciden con host/base allowlisted de aceptación.
- [ ] `SUPABASE_URL` coincide con el project ref allowlisted de aceptación.
- [ ] La service-role key pertenece al mismo proyecto, comprobado sin imprimirla.
- [ ] El bucket de aceptación existe, es privado y tiene el límite esperado.
- [ ] Ninguna variable del Preview apunta a producción o al staging demostrativo.
- [ ] La base nueva de aceptación contiene cero instituciones antes del E2E.
- [ ] Se registró evidencia de que staging permanece accesible y sin cambios.

Consultas de identidad en el SQL Editor del entorno de aceptación:

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SELECT COUNT(*) AS institutions_before FROM public.institutions;
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets;
```

Abortar ante cualquier discrepancia, resultado ambiguo o coincidencia con staging o producción. No ejecutar comandos de reset o eliminación.

## 4. Ejecución autorizada

Desde el checkout limpio del SHA candidato, conectado exclusivamente al entorno de aceptación nuevo:

```powershell
git rev-parse HEAD
git status --short
npm run test:pilot:config
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
npm run test:pilot:preview
```

No ejecutar `prisma migrate reset`, comandos de borrado ni limpieza de Storage. Las credenciales se cargan como variables de proceso y nunca se imprimen o guardan en el repositorio.

## 5. Evidencia

| Evidencia | Resultado |
|---|---|
| SHA ejecutado | PENDIENTE |
| Deployment/alias | PENDIENTE |
| Fecha/hora UTC | PENDIENTE |
| Identidad de aceptación verificada | PENDIENTE |
| Separación frente a staging/producción | PENDIENTE |
| Instituciones antes del E2E | Debe ser `0` |
| Migraciones terminadas | Debe coincidir con el inventario vigente |
| Bucket privado exclusivo verificado | PENDIENTE |
| Resultado Playwright | PENDIENTE |
| Staging demostrativo sin cambios | PENDIENTE |
| Ruta de trazas/capturas en `KIROCREW_SCRATCH` | PENDIENTE |

## 6. Límites y conservación

- Staging y su Storage no se resetean, vacían, sobrescriben ni borran.
- El entorno de aceptación se crea separado y se conserva después del E2E hasta una autorización futura de limpieza.
- Revertir Vercel no cambia datos de ninguna base.
- El runner deja la institución y datos piloto únicamente en aceptación.
- Repetir el recorrido requiere otro entorno nuevo o adaptar el runner de forma explícita; nunca se limpia staging para repetirlo.
- El recorrido actual no sustituye las pruebas separadas de segundo tenant y destinatario externo.

## 7. Resultado final

- [ ] **PASS:** recorrido completo desplegado, persistencia, permisos y archivo privado verificados.
- [ ] **FAIL:** registrar paso, error, traza y si el entorno quedó utilizable.
- [ ] **ABORT:** identidad o autorización insuficiente; no ejecutar escrituras.

**Conclusión:** PENDIENTE
