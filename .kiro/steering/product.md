---
inclusion: always
---
# Edukana — Producto

## Qué es

Edukana es una plataforma SaaS multiinstitución y de marca blanca para operar y enseñar: admisión, inscripción, estructura académica, sesiones presenciales/virtuales, contenidos, actividades, evaluación, comunicación, tutores, cobros administrativos y reportes. No es solo un aula virtual ni un módulo de anuncios.

## Tres niveles

| Nivel | Quién | Qué hace |
|---|---|---|
| Plataforma | Operador Edukana | Aprovisiona instituciones, planes, módulos, soporte y salud del servicio. |
| Institución | Administración, coordinación y docentes | Configura y opera programas, personas, ofertas, sesiones y resultados. |
| Usuario final | Estudiantes, tutores y compradores futuros | Estudia, entrega, consulta, se comunica y revisa obligaciones. |

## Tipos

Los tipos son presets de terminología, módulos y defaults. El código actual soporta SCHOOL, UNIVERSITY, INSTITUTE, ACADEMY y OTHER. MARKETPLACE es un producto posterior, no un enum implementado.

| Tipo | Estructura | Rasgos |
|---|---|---|
| SCHOOL | Año → período → grado/grupo → curso | Tutores, asistencia, boletín y mensualidades. |
| UNIVERSITY | Carrera → plan → asignatura/oferta | Créditos, prerrequisitos y récord. |
| INSTITUTE | Programa → nivel → cohorte → oferta | Sesiones híbridas, cuotas, certificados y admisión. |
| ACADEMY | Programa/curso → cohorte o self-paced | Cursos cortos y flexibilidad. |
| MARKETPLACE futuro | Categoría → curso → oferta | Venta, reseñas, comisiones y profesor independiente. |

## Prioridad

1. Seguridad, pruebas reales y sesión viva.
2. Identidad global y personas.
3. Course/Offering, programas, cohortes, grupos y matrícula masiva.
4. Semana híbrida con ClassSession, Panel Hoy y notificaciones.
5. Video por streaming.
6. Cierre académico, reportes y cobros administrativos.
7. IA docente.
8. Marketplace y pasarela.

## Clases en vivo

- Parte del recorrido híbrido.
- Detrás de `MeetingProvider`.
- Primera implementación: enlace externo.
- BigBlueButton se evalúa según concurrencia y presupuesto.
- No construir videoconferencia desde cero.

## Video

- Documentos e imágenes permanecen en Storage privado.
- Video grabado migra a streaming adaptable mediante `VideoProvider`.
- Debe reanudar, funcionar en móvil y controlar acceso.

## IA

- No bloquea el piloto.
- Primera función: asistente docente para lecciones, preguntas y rúbricas.
- Revisión humana obligatoria, presupuesto y auditoría por institución.
- Nunca califica definitivamente por sí sola.

## Cobros

Durante el piloto: cargos, estados, operaciones masivas, referencias y vías externas. Sin tarjetas, pasarela, webhooks ni conciliación. La pasarela entra con marketplace.

## Experiencia

1. El inicio responde qué tengo hoy, qué debo hacer y cómo voy.
2. Mínimo privilegio e información.
3. Una acción principal por pantalla.
4. Lenguaje cotidiano y móvil primero.
5. Marca y terminología institucionales.
6. Un usuario nuevo completa su tarea sin capacitación.
7. Seguir `simplicity.md`.

## Fuera de alcance inmediato

Videoconferencia propia, supervisión remota por cámara, apps nativas antes de PWA, nómina, biblioteca física, transporte, pasarela antes del marketplace e IA estudiantil antes de cerrar seguridad y fuentes.
