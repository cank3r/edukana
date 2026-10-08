# S0-12 — Registro de autorización y aceptación de staging

Este documento identifica el entorno, delimita la operación destructiva y conserva evidencia sin copiar secretos. Completarlo y obtener autorización explícita antes de cualquier reset.

## 1. Identidad allowlisted

| Recurso | Valor aprobado |
|---|---|
| Supabase project ref de staging | PENDIENTE |
| Host PostgreSQL de staging | PENDIENTE |
| Nombre de base de staging | PENDIENTE |
| Bucket privado | `edukana` |
| Proyecto Vercel | `cerkanasrl/edukana` |
| Rama Preview | `feat/edukana-real-mvp` |
| Alias Preview | `edukana-git-feat-edukana-real-mvp-cerkanasrl.vercel.app` |
| SHA candidato | Se registra al ejecutar |

No copiar `DATABASE_URL`, `DIRECT_URL`, claves de Supabase, tokens de Vercel ni contraseñas.

## 2. Autorización requerida

La autorización del propietario debe aceptar expresamente:

- Reset completo únicamente de la base PostgreSQL identificada arriba.
- Pérdida de todos los datos actuales de esa base de staging.
- Snapshot o backup previo y registro de su referencia no secreta.
- Aplicación de migraciones desde cero, sin seed.
- Escrituras del E2E y carga de un PNG al bucket privado de staging.
- Uso del bypass de automatización solo en el Preview identificado.
- Storage no se vacía. Eliminar objetos requiere inventario y autorización separados.

- **Autorizado por:** PENDIENTE
- **Fecha/hora UTC:** PENDIENTE
- **Texto o enlace de autorización:** PENDIENTE

## 3. Preflight obligatorio

Registrar sin secretos:

- [ ] HEAD local, rama del PR y deployment Vercel apuntan al mismo SHA.
- [ ] Árbol Git limpio.
- [ ] CircleCI y Vercel verdes para ese SHA.
- [ ] Revisión independiente aprobada para ese SHA.
- [ ] `DATABASE_URL` y `DIRECT_URL` coinciden con host/base allowlisted.
- [ ] `SUPABASE_URL` coincide con el project ref allowlisted.
- [ ] La service-role key pertenece al mismo proyecto, comprobado sin imprimirla.
- [ ] `SUPABASE_STORAGE_BUCKET=edukana`.
- [ ] Bucket existente, privado y con límite esperado.
- [ ] Ninguna variable Preview apunta a producción o a recursos compartidos.
- [ ] Snapshot/backup previo completado.

Consultas de identidad en el SQL Editor de staging:

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SELECT COUNT(*) AS institutions_before FROM public.institutions;
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'edukana';
```

Abortar ante cualquier discrepancia, resultado ambiguo, recurso compartido o falta de backup.

## 4. Ejecución autorizada

Desde el checkout limpio del SHA candidato:

```powershell
git rev-parse HEAD
git status --short
npm run test:pilot:config
npx prisma migrate status
npx prisma migrate reset --force --skip-seed
npx prisma migrate status
npm run test:pilot:preview
```

Las credenciales se cargan como variables de proceso y nunca se imprimen o guardan en el repositorio.

## 5. Evidencia

| Evidencia | Resultado |
|---|---|
| SHA ejecutado | PENDIENTE |
| Deployment/alias | PENDIENTE |
| Fecha/hora UTC | PENDIENTE |
| Identidad staging verificada | PENDIENTE |
| Referencia del backup | PENDIENTE |
| Instituciones antes | PENDIENTE |
| Instituciones después del reset | Debe ser `0` |
| Migraciones terminadas | Debe coincidir con el inventario vigente |
| Bucket privado verificado | PENDIENTE |
| Resultado Playwright | PENDIENTE |
| Ruta de trazas/capturas en `KIROCREW_SCRATCH` | PENDIENTE |

## 6. Límites y rollback

- `prisma migrate reset` no tiene reversión automática; restaurar exige el backup previo.
- Revertir Vercel no recupera datos borrados.
- El reset PostgreSQL no elimina objetos de Storage y puede dejar archivos huérfanos.
- El runner deja datos piloto; repetirlo requiere otro entorno limpio o una nueva autorización de reset.
- El recorrido actual no sustituye las pruebas separadas de segundo tenant y destinatario externo.

## 7. Resultado final

- [ ] **PASS:** recorrido completo desplegado, persistencia, permisos y archivo privado verificados.
- [ ] **FAIL:** registrar paso, error, traza y si el entorno quedó utilizable.
- [ ] **ABORT:** identidad o autorización insuficiente; no ejecutar escrituras.

**Conclusión:** PENDIENTE
