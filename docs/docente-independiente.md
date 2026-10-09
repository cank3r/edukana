# Docente independiente (M11)

Una persona que enseña por su cuenta crea su espacio en `/ensenar` sin saber qué es una «institución».

## Qué crea el alta

`registerIndependentTeacher` (`src/server/platform/independent.ts`), en una sola transacción:

1. **Cuenta** (`Identity`). Si el correo ya existe, se reutiliza solo si la contraseña coincide; si no, se rechaza
   con un mensaje que invita a recuperar la contraseña. La contraseña de una cuenta existente nunca se cambia.
2. **Espacio**: una `Institution` normal con `type = OTHER` y `settings.kind = "INDEPENDENT"`. No hay migración:
   la marca vive en `Institution.settings`. Nombre por omisión: «Cursos de &lt;nombre&gt;»; la dirección pública
   se deriva del nombre (`/catalogo/<dirección>`).
3. **Membresía** (`User`) con rol `ADMIN`: tiene todos los permisos y puede ser docente de sus propios cursos
   (`checkInput` en `src/server/courses/course.ts` lo permite solo en espacios independientes).
4. **Período** «Mis cursos», activo, de hoy a diez años: puede crear cursos de inmediato sin ver períodos.
5. Registro de auditoría `INDEPENDENT_SPACE_CREATED`.

Después el navegador inicia sesión con el mismo correo y contraseña en ese espacio y lleva a `/dashboard`.

## Límite de intentos

Reusa el limitador del inicio de sesión (`login_attempts`) con su propio ámbito `signup`: cada intento de alta
cuenta, salga bien o no. Máximo 5 por correo y 20 por IP cada 15 minutos (mismas variables que el login).

## Variable `INDEPENDENT_SIGNUP_ENABLED`

- `true`/`1`: activo. `false`/`0`: apagado (`/ensenar` responde 404 y la acción se niega).
- Sin valor: activo en todos los entornos, también en producción (decisión de Carlos, 2026-10-09).

## Qué ve el docente

- **Inicio** (`src/app/dashboard/IndependentHome.tsx`): «Crear un curso», «Mis cursos», «Ventas» y
  «Mi página pública».
- **Menú** (`navigationForRole(..., { independent: true })`): Inicio, Mis cursos, Ventas, Avisos, Configuración.
  Se ocultan personas, admisiones, cobros manuales, calendario y reportes. Las pantallas son las mismas de siempre.
- **Configuración**: solo «Datos de tu espacio». **Crear/editar curso**: sin selector de docente ni de período.

## Pruebas

`tests/integration/independent-teacher.test.ts`: alta completa, aislamiento entre dos docentes, correo existente con
contraseña errónea, límite de intentos y 404 con la variable apagada. `tests/ux.test.ts`: menú reducido.
