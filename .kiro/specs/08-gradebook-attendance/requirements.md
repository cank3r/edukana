# 08 · Calificaciones, boletines, asistencia y conducta — Requisitos

### Requisito 1 — Libro de calificaciones
1. Cuadrícula estudiantes × ítems por período con edición en celda, guardado por celda y navegación con teclado.
2. Categorías ponderadas, eliminar las N más bajas, ítems manuales, excusado, faltante.
3. Cálculo según `grading.*` del espacio (escala, redondeo, fórmula final, pesos de períodos).
4. `grade.publish` SHALL controlar qué ven estudiantes y tutores; nada es visible antes.
5. Importar/exportar CSV.

### Requisito 2 — Cierre de período
1. WHEN se cierra un período THEN SHALL calcularse y congelarse `TermGrade`, y bloquearse la edición.
2. La reapertura SHALL requerir `grade.period.reopen`, motivo y auditoría.
3. SHALL validarse antes de cerrar: ítems sin calificar, pesos que no suman 100.

### Requisito 3 — Recuperación (SCHOOL/UNIVERSITY)
1. IF `grading.recoveryEnabled` THEN SHALL registrarse evaluaciones de recuperación con sus reglas y recalcular la nota final.

### Requisito 4 — Boletín y récord
1. SCHOOL: boletín PDF por estudiante y período con todas las asignaturas, notas por período, promedio, asistencia, conducta y observaciones del titular.
2. UNIVERSITY: récord de notas con créditos, índice del período y acumulado; constancia de estudios.
3. INSTITUTE: reporte de progreso por programa.
4. Los PDFs SHALL generarse en segundo plano con la marca del espacio, en lote por grupo, y quedar disponibles para estudiante y tutor al publicar.
5. IF `finance.blockAccessOnDebt = ocultar notas` y hay deuda sobre el umbral THEN el boletín SHALL mostrarse bloqueado con el motivo.

### Requisito 5 — Asistencia
1. Modo `diaria por grupo` (SCHOOL) o `por clase` (resto), según parámetro.
2. Toma rápida: "Todos presentes" + excepciones; estados configurables; nota por registro.
3. Edición de fechas pasadas limitada por `attendance.editWindowDays`.
4. Justificación por el personal o por el tutor (si se permite) con adjunto y aprobación.
5. WHEN se registra ausencia y está activado THEN SHALL notificarse al tutor; tras N consecutivas SHALL alertarse a orientación.
6. Porcentaje de asistencia SHALL alimentar la regla de aprobación.

### Requisito 6 — Conducta y orientación
1. Docentes SHALL registrar observaciones (positivas y negativas) con tipo y gravedad; visibles a la familia solo si se marca.
2. `COUNSELOR` SHALL llevar notas confidenciales cifradas, invisibles para otros roles.

### Requisito 7 — Vista 360 del titular
1. `HOMEROOM` SHALL ver por estudiante de su grupo: notas de todas las asignaturas, asistencia, conducta y contacto de tutores.
