---
inclusion: always
---
# Edukana — Gobernanza de especificaciones

## Autoridad y estado

Este archivo define cómo interpretar `.kiro/steering/**` y `.kiro/specs/**`.

- `product.md`, `roles-permissions.md`, `tech.md`, `ui-ux.md`, `tenant-configuration.md`, `structure.md` y `data-model.md` establecen la dirección de producto y arquitectura.
- Los principios de mínimo privilegio, mínima información, identidad derivada de la sesión, denegación por defecto y marca blanca son vinculantes.
- Las specs `00` a `15` son un backlog de diseño **DRAFT**. No son instrucciones ejecutables todavía.
- Ninguna spec se implementa automáticamente por el hecho de existir.
- Antes de iniciar una spec, sus requisitos, diseño, dependencias, migraciones, seguridad y criterios de aceptación deben quedar consistentes y aprobados.

## Puerta obligatoria antes de implementar

Una spec solo cambia de `DRAFT` a `READY` cuando cumple todo lo siguiente:

1. Dependencias explícitas y sin ciclos.
2. Modelo de datos implementable, con `tenantId`, índices y restricciones definidos.
3. Migración, backfill, compatibilidad temporal y rollback documentados.
4. Permisos, ámbito, relación con el recurso y estado incluidos en la matriz.
5. Threat model para tenant, PII, archivos, tokens, integraciones y acciones sensibles.
6. Criterios de aceptación verificables para rutas, consultas, acciones y UI.
7. Estados vacío, error, cargando, sin permiso y solo lectura definidos.
8. Pruebas de URL directa, ID de otro usuario e ID de otro tenant.
9. Decisiones abiertas resueltas en el `design.md` de la spec.
10. Revisión humana de cualquier cambio de contrato visible o irreversible.

## Correcciones obligatorias del paquete recibido

1. Corregir dependencias de `08`, `09`, `11` y `14`.
2. Separar `15` en requisitos fundacionales tempranos y hardening final, o distribuir sus gates en cada spec.
3. Definir el contrato persistente de eventos: outbox, versión, idempotencia, orden y deduplicación.
4. Aclarar qué modelos llevan `tenantId` físico y cómo se aplican RLS e índices.
5. Reemplazar notaciones polimórficas ambiguas como `offeringId|groupId` por relaciones implementables.
6. Definir entidades y ciclos de vida para API keys, webhooks, tokens, sesiones y suplantación.
7. Completar threat models de proxy, RLS, archivos, PWA, OAuth, auditoría, pagos y datos de menores.
8. Definir precedencia de configuración, cambio de tipo de tenant, respaldo, retención, borrado, SLO y rollback.

## Orden de trabajo

Orden base:

`00 → 01 → 02 → 03 → 04 → 05 → 06 → 07`

Después se ejecutan únicamente ramas cuyas dependencias corregidas estén en estado `DONE`. La existencia de ramas en el DAG no autoriza trabajo paralelo sobre contratos inestables.

- `10` puede construir primero el bus y contratos de comunicación; las integraciones por dominio se completan cuando existan sus productores.
- `12` debe existir antes de cualquier requisito que dependa de deuda, pagos o cuenta financiera.
- `09` requiere identidad, personas, estructura académica, calificaciones, comunicación y finanzas cuando muestre pagos.
- `11` requiere personas, matrícula, comunicación y finanzas cuando asigne planes de pago.
- `14` requiere los dominios cuyos reportes agregará.
- `15` aporta gates transversales desde el inicio y una revisión final antes de producción.

## Reglas de ejecución

- Implementar una spec por vez salvo que el DAG aprobado demuestre independencia real y no exista solapamiento de archivos, esquema o contratos.
- No iniciar la siguiente spec con tareas bloqueantes abiertas en una dependencia.
- No aplicar migraciones destructivas, fusionar ni desplegar producción sin autorización explícita.
- Toda decisión no cubierta se registra en el `design.md` correspondiente antes de escribir código.
- El código existente no se considera correcto por coincidir parcialmente con una spec; debe pasar sus criterios de aceptación.

## Prioridad inmediata sobre el MVP actual

Antes de expandir funcionalidades:

1. Bloquear acceso de tutores sin vínculo a cursos y datos institucionales.
2. Eliminar nombres y correos de compañeros visibles para estudiantes.
3. Eliminar información financiera indirecta para coordinadores y docentes.
4. Hacer cursos completados totalmente de solo lectura.
5. Unificar navegación, middleware, DAL, acciones y componentes bajo el mismo registro de capacidades.
6. Ejecutar una matriz automatizada de roles, relaciones, estados y tenant.

## Registro de procedencia

Paquete recibido el 2 de octubre de 2026, generado sobre `feat/edukana-real-mvp` en `3bfa7c7`. Fue auditado antes de incorporarse: no contenía secretos ni ejecutables; incluía 56 documentos Markdown y un cambio para dejar de ignorar `.kiro/`.
