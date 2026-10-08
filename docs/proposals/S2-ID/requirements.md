# S2 · Identidad y personas — Requisitos (propuesta)

**Estado:** PROPUESTA. La importación masiva (R4) ya está implementada sobre el esquema de S1 porque no depende del resto.
**Autor:** Claude. **Fecha:** 2026-10-08. **Depende de:** S1-SEC-A (PR #6).

## Objetivo

Que una persona tenga una sola cuenta aunque pertenezca a varias instituciones, que la administración pueda dar de
alta 1,600 personas desde un archivo sin ayuda técnica, y que exista una forma de crear instituciones nuevas.

## Decisión que necesita aprobación de Carlos

`current-state.md` (decisión 2) dice: "`User` global con correo único + `Membership`". Propongo llegar al mismo
resultado con otro reparto de tablas, que evita reescribir todas las relaciones existentes:

| | Decisión escrita | Propuesta |
|---|---|---|
| Cuenta global | `User` pasa a ser global | Tabla nueva `Identity` (correo único, contraseña, versión de sesión) |
| Pertenencia a una institución | Tabla nueva `Membership` | El `User` actual, que ya es exactamente eso: institución + rol + estado |
| Relaciones existentes (matrículas, notas, entregas…) | Hay que repuntarlas a la nueva cuenta o a la membresía | No se tocan: siguen apuntando a `User` |

Para el producto el resultado es idéntico. Para la migración, la propuesta agrega una tabla y una columna en vez de
mover unas cuarenta relaciones. Si en el futuro se prefiere el nombre `Membership`, renombrar `User` es un cambio
mecánico posterior.

## Requisitos

**R1 — Una cuenta por correo**
1. Un correo SHALL corresponder a una sola `Identity` en toda la plataforma.
2. Una `Identity` SHALL poder tener un `User` (membresía) en varias instituciones.
3. La contraseña, la versión de sesión y el bloqueo por intentos SHALL pertenecer a la `Identity`.
4. WHEN una persona con una sola membresía inicia sesión THEN SHALL entrar directo a su institución.
5. WHEN tiene varias THEN SHALL elegir institución; puede cambiar sin volver a escribir la contraseña.
6. Suspender una membresía SHALL cortar el acceso solo a esa institución; suspender la `Identity`, a todas.

**R2 — Migración sin fusiones automáticas**
1. Cada `User` actual SHALL quedar enlazado a una `Identity` con su mismo correo.
2. WHEN un correo existe hoy en una sola institución THEN su contraseña SHALL pasar a la `Identity`.
3. WHEN un correo existe en dos o más instituciones THEN la `Identity` SHALL nacer sin contraseña y la persona
   SHALL definirla con el enlace de recuperación, que demuestra que controla ese correo. Ninguna contraseña
   existente se elige por ella.
4. La migración SHALL ser aditiva y reversible desplegando el código anterior.

**R3 — Invitaciones**
1. La administración SHALL invitar a una o varias personas; cada una recibe un enlace de un solo uso válido 7 días.
2. WHEN la persona ya tiene `Identity` THEN SHALL aceptar con su sesión, sin crear otra contraseña.
3. La invitación SHALL poder reenviarse y revocarse.

**R4 — Importación masiva** *(implementada)*
1. La administración SHALL subir un CSV con columnas Nombre y Correo; Rol y Teléfono son opcionales.
2. El sistema SHALL mostrar antes de crear: cuántas se crearán, cuántas ya existen y cuáles filas se rechazan con su motivo.
3. Las filas rechazadas SHALL poder descargarse como archivo para corregirlas.
4. Solo se crean filas válidas; las cuentas existentes nunca se modifican.
5. Repetir el archivo o reintentar tras un fallo SHALL NOT duplicar cuentas.
6. Roles administrativos SHALL NOT poder importarse.
7. 1,600 filas SHALL procesarse en menos de 2 minutos.

**R5 — Ciclo de vida**
1. Suspender y reactivar una persona, con confirmación; la suspensión corta la sesión en la siguiente petición.
2. Editar nombre y teléfono, con auditoría.

**R6 — Alta de instituciones**
1. Un operador de la plataforma SHALL crear una institución nueva con su tipo y su primer administrador invitado.
2. Ningún dato de la nueva institución SHALL ser visible desde otra.

## Criterios de salida

- La misma persona entra a dos instituciones con una contraseña y ve en cada una solo lo suyo.
- Suspenderla en una no afecta la otra.
- Un archivo de 1,600 estudiantes se importa desde la pantalla, con errores corregibles, y cada estudiante activa su cuenta por correo.
- Una segunda institución se crea sin SQL ni acceso técnico.
