# 02 · Identidad y acceso — Diseño

## Datos
`User` global; `Membership`; `Invitation`; `PasswordReset`; `LoginAttempt`; `TwoFactor(userId, secretEncrypted, recoveryCodesHash[])`. Migración: cada `User` actual → `User` + `Membership` con el rol de sistema equivalente (`COORDINATOR`→`ACADEMIC_LEAD`, `PARENT`→`GUARDIAN`, `SUPER_ADMIN`→`OWNER`). Correos duplicados entre instituciones se fusionan en una cuenta con dos membresías.

## Sesión
JWT: `{ sub, sv }`. Callback `jwt` revalida `sessionVersion` y estado cada 5 min. Rol activo en cookie `ek_role` validada contra membresías en `getRequestContext`. Permisos nunca en el token.

## Tokens
32 bytes aleatorios; se guarda SHA-256; comparación en tiempo constante; un solo uso.

## Límite de intentos
Ventana deslizante en Postgres (`LoginAttempt`) por correo y por IP; retraso progresivo.

## Rutas
`/login`, `/invitacion/[token]`, `/recuperar`, `/restablecer/[token]`, `/verificar/[token]`, `/registro` (solo catálogo), `/elegir-espacio`, `/cuenta/**`.

## Pruebas
Mismo correo en dos espacios; token reutilizado; token vencido; desactivación en caliente; enumeración de cuentas; bloqueo por intentos; cambio de rol activo no autorizado.
