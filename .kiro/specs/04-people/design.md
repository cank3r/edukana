# 04 · Personas — Diseño
**Datos:** `PersonProfile`, `CustomFieldDef(tenantId, entity, key, type, options, visibleToRoles, required)`, `PersonDocument`, `ImportJob(type, status, mapping, stats, errorReportAssetId)`.
**DAL:** `listPeople(ctx, filters, cursor)` proyecta columnas por permiso; `getPersonView(ctx, id, tab)` una consulta por pestaña.
**Importación:** archivo a Storage → job analiza con streaming → `ImportRow` temporal para la vista previa → confirmación procesa en lotes de 200 dentro de transacciones → reporte CSV. Detección de duplicados por correo normalizado, código, documento.
**Código de estudiante:** secuencia por espacio y año con bloqueo (`SELECT … FOR UPDATE`).
**UI:** `/personas`, `/personas/importar`, `/personas/[id]/[tab]`, Drawer de alta rápida.
**Pruebas:** proyección por rol; importación repetida no duplica; límite del plan; ficha de otro espacio 404; ámbito del coordinador.
