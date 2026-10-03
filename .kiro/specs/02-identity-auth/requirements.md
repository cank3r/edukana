# 02 · Identidad y acceso — Requisitos

### Requisito 1 — Cuenta global con membresías
1. Un correo SHALL corresponder a una sola cuenta en toda la plataforma.
2. Una cuenta SHALL poder tener membresías en varios espacios y varios roles por espacio.
3. WHEN el usuario tiene varios roles en el espacio THEN SHALL ver un selector de rol; el rol activo determina navegación y permisos.
4. WHEN entra por `app.edukana.com` con varias membresías THEN SHALL elegir espacio y ser redirigido a su dominio.

### Requisito 2 — Invitación
1. WHEN el personal invita a una persona THEN SHALL enviarse un enlace de un solo uso válido 7 días.
2. WHEN el invitado ya tiene cuenta THEN SHALL aceptar con su sesión sin crear otra contraseña.
3. La invitación SHALL poder reenviarse y revocarse.
4. Para estudiantes sin correo (menores) SHALL permitirse usuario + contraseña temporal entregada por la institución, con cambio obligatorio.

### Requisito 3 — Inicio de sesión
1. Métodos según `security.allowedLoginMethods`: contraseña, Google, Microsoft.
2. WHEN hay N intentos fallidos THEN SHALL bloquear temporalmente por correo e IP.
3. Los mensajes SHALL NOT revelar si el correo existe.
4. WHEN `security.require2faForStaff` THEN el personal SHALL configurar TOTP en su siguiente ingreso.

### Requisito 4 — Recuperación
1. WHEN se solicita recuperación THEN SHALL enviarse enlace de un solo uso válido 1 hora y la respuesta SHALL ser idéntica exista o no la cuenta.
2. WHEN se cambia la contraseña THEN SHALL invalidar todas las sesiones.

### Requisito 5 — Sesión viva
1. WHEN se desactiva una membresía o cambia un rol THEN el efecto SHALL aplicarse en la siguiente petición.
2. WHEN se desactiva una cuenta THEN sus sesiones SHALL dejar de funcionar en ≤ 5 minutos.

### Requisito 6 — Registro público
1. IF el módulo `catalog` está activo THEN SHALL existir registro abierto que crea cuenta + membresía `STUDENT` con verificación de correo.
2. En otro caso SHALL NOT existir registro abierto.

### Requisito 7 — Mi cuenta
1. El usuario SHALL poder editar foto, idioma, zona horaria, contraseña, 2FA y preferencias de notificación; ver sus sesiones y cerrarlas.
