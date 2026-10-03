# 03 · Roles, permisos y configuración del espacio — Requisitos

### Requisito 1 — Roles de sistema y personalizados
1. Cada espacio SHALL tener las plantillas de su tipo (ver `roles-permissions.md`), no editables.
2. IF `features.customRoles` THEN el administrador SHALL poder duplicar un rol y ajustar permisos en una matriz agrupada por área.
3. WHEN se activa una combinación riesgosa (finanzas + notas, `roles.manage`) THEN SHALL mostrar advertencia y pedir confirmación.
4. SHALL existir "Ver como este rol" que muestra la navegación resultante sin datos reales.
5. SHALL impedirse eliminar un rol con membresías activas y dejar el espacio sin `OWNER`.

### Requisito 2 — Asignación con ámbito
1. WHEN se asigna un rol THEN SHALL poder limitarse a sede, nivel/facultad, programa u oferta.
2. WHEN un usuario con ámbito consulta listas THEN SHALL ver solo registros dentro de su ámbito.
3. Las reglas fijas de `roles-permissions.md` SHALL cumplirse aunque un rol personalizado tenga el permiso.

### Requisito 3 — Registro de configuración
1. Todo parámetro de `tenant-configuration.md` SHALL estar en el registro tipado con valor por defecto por tipo.
2. WHEN se lee un parámetro THEN SHALL resolverse usuario → oferta → espacio → preset.
3. WHEN se guarda un valor inválido THEN SHALL rechazarse con mensaje por campo.
4. Cada cambio SHALL auditarse.

### Requisito 4 — Pantallas de configuración
1. La configuración SHALL organizarse en secciones: General, Marca, Dominio, Terminología, Estructura académica, Calificación, Evaluación, Asistencia, Matrícula, Personas y privacidad, Familia, Comunicación, Finanzas, Marketplace, Certificados, Seguridad, Integraciones, Suscripción.
2. Cada sección SHALL mostrarse solo si su módulo está activo y el usuario tiene `tenant.settings.view`.
3. Cada campo SHALL mostrar ayuda, indicar si usa el valor sugerido y permitir restablecerlo.
4. WHEN un cambio afecta datos existentes (escala, pesos de período) THEN SHALL mostrar el impacto y pedir confirmación; los períodos cerrados no se recalculan.

### Requisito 5 — Terminología
1. WHEN el administrador cambia un término THEN toda la interfaz, correos y PDFs SHALL usarlo, con singular y plural.

### Requisito 6 — Secretos e integraciones
1. Las credenciales SHALL guardarse cifradas y mostrarse enmascaradas; SHALL existir "Probar conexión".

### Requisito 7 — Auditoría visible
1. `tenant.audit.view` SHALL dar acceso a un registro filtrable por actor, acción, entidad y fecha, exportable.
