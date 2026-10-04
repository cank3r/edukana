# 11 · Admisiones — Requisitos
### Requisito 1 — Formulario público
1. Cada espacio SHALL tener un formulario en su sitio público con campos configurables por programa, carga de documentos y consentimiento de datos explícito y versionado.
2. SHALL protegerse contra bots y limitar peticiones.
3. El aspirante SHALL recibir confirmación y un enlace para consultar estado y completar documentos.
### Requisito 2 — Embudo
1. Etapas configurables (por defecto: Interesado, Documentos, Evaluación, Aceptado, Matriculado, Rechazado) en tablero Kanban y tabla.
2. Asignación a responsable, notas internas, tareas de seguimiento, historial.
3. Cada cambio de etapa SHALL poder disparar una plantilla de mensaje.
4. Reportes: conversión por etapa, origen y programa.
### Requisito 3 — Conversión
1. "Convertir en estudiante" SHALL crear en una transacción: cuenta, membresía, perfil, tutores y vínculos, matrícula inicial y plan de pagos, y enviar invitaciones.
2. SHALL detectar si la persona o el tutor ya existen y reutilizarlos.
3. SHALL respetar `limits.students`.
### Requisito 4 — Cuota de inscripción
1. IF está configurada THEN el aspirante SHALL poder pagarla en línea desde su enlace.
