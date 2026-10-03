# 04 · Personas y directorio — Requisitos

### Requisito 1 — Directorio
1. SHALL existir directorio con pestañas Estudiantes, Docentes, Personal, Tutores; búsqueda por nombre, correo, código y documento; filtros por estado, sede, grado/programa.
2. SHALL ofrecer acciones masivas: invitar, matricular, cambiar estado, exportar.
3. Los campos visibles SHALL depender de permisos (`people.contact.view`, `people.sensitive.view`).

### Requisito 2 — Alta y edición
1. WHEN se crea un estudiante THEN SHALL generarse su código según `people.studentIdFormat` y validarse los campos obligatorios y personalizados.
2. SHALL poder vincularse tutores en el mismo flujo (tipos SCHOOL).
3. Desactivar SHALL conservar historial; borrar solo por solicitud de privacidad.

### Requisito 3 — Importación CSV
1. Flujo: subir → mapear columnas → vista previa con errores por fila → confirmar → proceso en segundo plano → reporte descargable.
2. La importación SHALL ser idempotente por correo, código o documento.
3. SHALL soportar plantillas: estudiantes, estudiantes + tutores, docentes, matrículas.
4. SHALL respetar `limits.students`.

### Requisito 4 — Ficha
1. Pestañas según permiso: Resumen, Académico, Asistencia, Familia, Cuenta, Documentos, Conducta, Actividad.
2. Una pestaña sin permiso SHALL NOT consultarse ni renderizarse.
3. Documentos adjuntos SHALL ser privados y con categoría (identidad, acta, salud, otros).

### Requisito 5 — Campos personalizados
1. El administrador SHALL definir campos (texto, número, fecha, lista) con visibilidad por rol y obligatoriedad.

### Requisito 6 — Privacidad
1. SHALL existir exportación de los datos de una persona y anonimización, con registro.
2. El acceso a datos sensibles de menores SHALL auditarse.
