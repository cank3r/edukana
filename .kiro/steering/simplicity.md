---
inclusion: always
---
# Edukana — Regla de simplicidad

El usuario típico no es técnico, usa con frecuencia el celular y no debe depender de capacitación. Si una pantalla necesita explicación externa para completar su tarea principal, la pantalla no está terminada.

## Reglas obligatorias

1. Una acción principal visible con un verbo concreto: “Entrar a clase”, “Entregar tarea”, “Tomar asistencia”.
2. El inicio responde: qué tengo hoy, qué debo hacer y cómo voy.
3. Lenguaje cotidiano en español; nunca mostrar tenant, capability, slug, asset, IDs o estados internos.
4. Formularios largos se dividen en 3–5 pasos, con defaults y resumen antes de confirmar.
5. Un estado vacío explica qué es y ofrece la acción para comenzar.
6. Un error dice qué ocurrió y qué hacer ahora, sin culpar al usuario.
7. Publicar, notificar, revocar o cambiar muchas personas exige confirmación y muestra el impacto.
8. Lo avanzado queda bajo “Opciones avanzadas”; el caso común funciona sin abrirlo.
9. Primero móvil: controles de al menos 44 px, sin tablas laterales obligatorias ni hover como único acceso.
10. La tarea principal está a dos acciones desde el inicio cuando sea razonable.
11. La primera experiencia de cada rol ofrece pasos iniciales que se completan automáticamente.
12. No duplicar conceptos, acciones ni navegación en una misma pantalla.

## Prueba de aceptación por pantalla

- Una persona nueva completa la tarea principal en menos de un minuto sin ayuda, salvo flujos inherentemente largos.
- Funciona a 360 px de ancho y con teclado.
- No aparecen términos internos.
- Textos de botones, vacíos, confirmaciones y errores se definen en la spec antes del código.
- El resultado persiste y puede comprobarse después de recargar o volver a iniciar sesión.

## Objetivos de tiempo

- Estudiante: entrar a su próxima clase en dos acciones.
- Docente: asistencia de 30 estudiantes en menos de un minuto; todos presentes por defecto, registrar excepciones.
- Docente: crear una tarea básica en menos de dos minutos.
- Administración: importar estudiantes desde CSV sin leer un manual.
