# 07 · Tareas y exámenes — Requisitos

### Requisito 1 — Tareas
1. El docente SHALL definir instrucciones, fecha, puntaje, tipos de entrega (texto, archivo, enlace), intentos, política de tardanza y rúbrica, con valores por defecto del espacio.
2. WHEN el estudiante entrega THEN SHALL crearse un intento nuevo; nunca se sobrescribe.
3. WHEN la entrega es tardía THEN SHALL aplicarse la política (bloquear, permitir, penalizar) y marcarse.
4. El docente SHALL calificar en la vista de tres paneles con rúbrica, comentario y archivo privado de retroalimentación.
5. La nota del libro SHALL corresponder al intento según política, sin notas huérfanas.
6. SHALL poder excusarse a un estudiante y ampliarse la fecha individualmente.

### Requisito 2 — Rúbricas
1. SHALL existir biblioteca de rúbricas reutilizables (criterios × niveles con puntos).
2. El estudiante SHALL ver la rúbrica antes de entregar y el nivel obtenido después.

### Requisito 3 — Banco de preguntas
1. Tipos: opción única, varias correctas, verdadero/falso, respuesta corta, numérica con tolerancia, emparejar, ensayo.
2. Etiquetas y dificultad; importación desde CSV.
3. Las claves de respuesta SHALL NOT enviarse al navegador del estudiante.

### Requisito 4 — Exámenes
1. El docente SHALL componer el examen eligiendo preguntas o cantidad aleatoria por etiqueta.
2. Parámetros: ventana de disponibilidad, duración, intentos, política de nota, barajar, cuándo mostrar resultados, una pregunta por página o todas.
3. WHEN el estudiante inicia THEN el servidor SHALL crear el intento con `expiresAt` y fijar el orden de preguntas.
4. Las respuestas SHALL guardarse automáticamente; al recargar SHALL continuar el mismo intento con el tiempo restante del servidor.
5. WHEN vence el tiempo THEN SHALL enviarse automáticamente; envíos posteriores a la gracia SHALL rechazarse.
6. Dos inicios simultáneos SHALL NOT crear dos intentos.
7. Las preguntas automáticas SHALL calificarse al enviar; ensayo y respuesta corta van a revisión.
8. SHALL poder otorgarse tiempo extra o intento adicional a un estudiante (adecuaciones).

### Requisito 5 — Estudiante
1. SHALL ver lista de pendientes ordenada por vencimiento con estado (sin entregar, entregada, calificada, tardía).
2. En matrícula no activa SHALL ver historial sin poder entregar.
