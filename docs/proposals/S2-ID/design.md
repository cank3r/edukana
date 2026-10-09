# S2 · Identidad y personas — Diseño (propuesta)

**Estado:** PROPUESTA. **Autor:** Claude. **Fecha:** 2026-10-08.

## Modelo

```
Identity          id, email @unique, passwordHash?, sessionVersion Int @default(0),
                  status ACTIVE|SUSPENDED, createdAt, updatedAt
User              + identityId String?  (FK a Identity; NOT NULL en migración posterior)
                  + @@unique([institutionId, identityId])
Invitation        id, institutionId, email, role, tokenHash @unique, expiresAt, acceptedAt?, revokedAt?,
                  invitedById, createdAt        @@index([institutionId, email])
PlatformOperator  identityId @id, createdAt
```

`User.password` y `User.sessionVersion` quedan en lectura dual durante la transición y se retiran al final.
`PasswordResetToken.userId` pasa a `identityId` (columna nueva, backfill, luego se retira la anterior).

## Migración `s2_identity` (aditiva)

1. Crear `Identity` e insertar una fila por correo distinto.
2. Copiar `password` y `sessionVersion` solo cuando el correo aparece en un único `User`.
3. Enlazar `users.identityId`.
4. Guarda: abortar si queda algún `User` sin `Identity`.

## Sesión

El token lleva `sub = identityId`, `sv` y `uid` (membresía activa). `resolveLiveIdentity` valida las tres cosas:
identidad activa, versión vigente y membresía activa que pertenece a esa identidad. Cambiar de institución
reemite el token con otro `uid` tras comprobar la pertenencia; no pide contraseña.

Todo el código existente sigue recibiendo `session.user.id` (el `User`), `role` e `institutionId`. Por eso el
cambio de sesión no toca páginas ni acciones.

## Login

`authorize` busca la `Identity` por correo (ya no hay ambigüedad), valida la contraseña y lista sus membresías
activas. Con una, entra. Con varias, `/elegir-institucion`. La prueba de integración que hoy documenta la
ambigüedad ("el mismo correo activo en dos instituciones") cambia de expectativa en este sprint.

## Importación (hecha)

`src/server/imports/{csv,people,people-apply}.ts` y `src/server/actions/people-import.ts`.
Dos pasos con el mismo formulario: previsualizar y confirmar. Las cuentas nacen sin contraseña; la activación
usa el enlace de recuperación de S1. Con `Identity`, `applyPeopleImport` creará o reutilizará la identidad
por correo en la misma operación.

## Reparto

| Claim | Agente | Alcance |
|---|---|---|
| S2-ID-A | Claude | Esquema y migración `s2_identity`, sesión, login, invitaciones (servidor), importación (servidor), pruebas de integración |
| S2-ID-B | Kiro | Pantallas: importar personas, invitar, elegir institución, suspender y reactivar, alta de institución |
| S2-ID-C | Codex | Revisión adversarial: cambio de institución, membresía suspendida, enlace de invitación reutilizado |

## Riesgos

- **Dos personas distintas compartiendo un correo entre instituciones.** Quedarían con una sola identidad. Es
  inherente a "un correo, una cuenta"; se mitiga porque la identidad nace sin contraseña y solo quien recibe el
  correo puede activarla.
- **Estudiantes sin correo.** No cubiertos. Si el instituto los tiene, hace falta usuario + contraseña temporal
  (spec 02, requisito 2.4). Pregunta abierta para Carlos.
