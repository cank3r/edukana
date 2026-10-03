# 00 · Fundaciones y correcciones bloqueantes — Requisitos

## Introducción
Sustituye las reglas dispersas del MVP (commit 3bfa7c7) por contexto de petición, autorización central, capa de datos, auditoría y pruebas reales. Nada más se construye hasta cerrar esta spec.

### Requisito 1 — Denegar por defecto
**Historia:** Como responsable de seguridad, quiero que toda ruta exija un permiso declarado, para que una pantalla nueva no nazca abierta.
1. WHEN se solicita una ruta de la aplicación sin permiso declarado THEN el sistema SHALL responder 404.
2. WHEN un usuario sin el permiso abre una URL directa THEN el sistema SHALL responder 404 sin ejecutar consultas de datos.
3. IF el rol es `GUARDIAN` sin vínculo activo THEN el sistema SHALL permitir solo avisos generales y su cuenta.

### Requisito 2 — Autorización única
**Historia:** Como desarrollador, quiero una sola función `can()`, para que la interfaz y el servidor nunca discrepen.
1. WHEN un componente muestra una acción THEN el sistema SHALL haberla evaluado con el mismo `can()` que usa la Server Action.
2. WHEN `can()` niega THEN SHALL devolver un motivo legible que la interfaz muestra.
3. WHEN una acción es rechazada por estado (matrícula no activa, período cerrado) THEN la interfaz SHALL mostrar solo lectura en lugar del formulario.

### Requisito 3 — Capa de datos con proyección mínima
**Historia:** Como estudiante, quiero que el servidor no cargue datos ajenos, para proteger la privacidad.
1. WHEN un estudiante abre un curso THEN la respuesta SHALL excluir nombres, correos, entregas, notas y asistencia de otros estudiantes.
2. WHEN un coordinador abre la ficha de un estudiante THEN el sistema SHALL NOT consultar pagos.
3. WHEN un docente abre el curso THEN el sistema SHALL NOT enviar claves de respuesta al navegador salvo en la pantalla de edición del banco.

### Requisito 4 — Progreso separado del estado de matrícula
1. WHEN un estudiante completa todas las lecciones THEN el sistema SHALL actualizar `progressPercent` sin cambiar `status`.
2. WHEN la matrícula está `ACTIVE` THEN el estudiante SHALL poder entregar tareas y presentar exámenes aunque el progreso sea 100 %.
3. WHEN la matrícula no está `ACTIVE` THEN la interfaz SHALL mostrar "Vista de consulta" sin formularios.

### Requisito 5 — Correcciones puntuales
1. Asistencia del estudiante SHALL filtrarse por `enrollmentId`.
2. La toma de asistencia SHALL listar solo matrículas activas.
3. El conteo de avisos del tablero SHALL usar la misma función de visibilidad que la lista.
4. El formulario de avisos SHALL exigir el rol cuando la audiencia es por rol.
5. Los archivos de retroalimentación SHALL ser visibles solo para el personal de la oferta y el estudiante dueño de la entrega.
6. Los certificados SHALL firmarse con HMAC-SHA256 y compararse en tiempo constante.
7. Los totales financieros SHALL agruparse por moneda.

### Requisito 6 — Auditoría, errores y pruebas
1. WHEN ocurre una acción sensible THEN el sistema SHALL escribir `AuditLog` con antes y después.
2. WHEN una acción falla THEN el sistema SHALL registrar el error con ID de correlación y devolver un mensaje útil.
3. El CI SHALL ejecutar pruebas de integración con Postgres y la matriz permiso × rol; SHALL fallar si alguna ruta carece de permiso declarado.
