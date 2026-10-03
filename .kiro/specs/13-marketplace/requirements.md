# 13 · Catálogo y marketplace — Requisitos

## Introducción
Aplica a espacios `MARKETPLACE` y a cualquier espacio con módulo `catalog`. Cada espacio tiene su propio catálogo con su marca. Opcionalmente, el operador mantiene un espacio propio que funciona como marketplace público de Edukana.

### Requisito 1 — Sitio público y catálogo
1. Página de inicio configurable, catálogo con búsqueda y filtros (categoría, nivel, precio, duración, valoración, idioma) y páginas de curso renderizadas en servidor con metadatos para buscadores.
2. La página de curso SHALL mostrar: resultado prometido, video de presentación, temario con lecciones de vista previa, instructor, reseñas, precio y botón de compra; barra de compra fija en móvil.

### Requisito 2 — Publicación
1. El instructor SHALL crear cursos y solicitar publicación; IF `market.requireReviewBeforePublish` THEN `CONTENT_REVIEWER` aprueba o devuelve con comentarios.
2. Lista de verificación de calidad antes de enviar (portada, descripción, mínimo de lecciones, precio).

### Requisito 3 — Compra
1. Checkout en una página: resumen, cupón, cuenta (crear o entrar), pago por pasarela alojada.
2. WHEN el pago se confirma THEN SHALL crearse la matrícula con `source = PURCHASE` y dar acceso inmediato.
3. Cursos gratuitos SHALL inscribirse sin pasarela.
4. Acceso de por vida o por meses según `market.accessModel`.
5. Precios en las monedas configuradas.

### Requisito 4 — Cupones
1. Porcentaje o monto fijo, vigencia, límite total y por usuario, por curso o global, enlace con cupón aplicado.

### Requisito 5 — Reseñas
1. Solo matriculados con progreso ≥ `market.reviewMinProgressPct`; una por matrícula; editable.
2. Moderación previa o posterior; el instructor puede responder.

### Requisito 6 — Reembolsos
1. Dentro de `market.refundWindowDays` y bajo `market.refundMaxProgressPct`; revoca acceso y revierte la ganancia del instructor.

### Requisito 7 — Instructores y liquidaciones
1. Cada venta SHALL registrar la ganancia del instructor según su porcentaje, neta de comisión de pasarela y reembolsos.
2. Liquidación por período con mínimo; estados Pendiente, Aprobada, Pagada; pago por transferencia registrado con referencia.
3. Panel del instructor: ventas, estudiantes, valoración, preguntas sin responder, liquidaciones. Sin correos de alumnos salvo parámetro.

### Requisito 8 — Experiencia del alumno
1. "Mis cursos", continuar, certificado al completar, preguntas por lección, recomendaciones por categoría.

### Requisito 9 — Comisión de plataforma
1. IF el plan del espacio es por comisión THEN cada venta SHALL registrar la comisión de Edukana y reflejarse en la facturación SaaS.
