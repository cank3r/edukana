# 06 · Contenido y video — Requisitos

### Requisito 1 — Constructor
1. El docente SHALL organizar secciones y lecciones arrastrando; el orden SHALL persistir sin violar unicidad.
2. Tipos de lección: texto enriquecido, video, documento, enlace, actividad (tarea o examen enlazado), sesión en vivo.
3. Cada lección SHALL tener estado borrador/publicada, fecha de liberación opcional, prerrequisito opcional y marca de vista previa pública.
4. SHALL existir "Vista previa como estudiante".
5. El texto SHALL sanearse; sin scripts ni HTML arbitrario.

### Requisito 2 — Video
1. Los videos SHALL transcodificarse y servirse por streaming adaptable mediante un proveedor externo.
2. La reproducción SHALL requerir URL firmada emitida tras verificar matrícula o vista previa.
3. SHALL guardarse la posición cada 15 s y reanudar; completar automáticamente al 90 %.
4. SHALL soportar subtítulos, velocidad y calidad.
5. El consumo SHALL contarse contra `limits.videoMinutes` y `limits.storageGb`.

### Requisito 3 — Experiencia del estudiante
1. El reproductor SHALL mostrar índice con progreso, botón "Completar y continuar" y notas personales.
2. Lecciones bloqueadas SHALL mostrar el motivo (fecha o prerrequisito).
3. El inicio SHALL ofrecer "Continúa donde quedaste".

### Requisito 4 — Archivos
1. Tipos y tamaño según `assess.allowedFileTypes` y `assess.maxFileMb`; verificación de tipo real tras la carga.
2. Las descargas SHALL emitirse con URL firmada de 5 minutos.

### Requisito 5 — Reutilización
1. Un curso SHALL poder duplicarse y exportarse/importarse entre espacios por el operador.
