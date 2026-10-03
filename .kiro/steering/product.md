---
inclusion: always
---
# Edukana — Producto

## Qué es
Edukana es una plataforma SaaS multi-tenant de **marca blanca** para educación. El **operador de la plataforma** (Edukana HQ) vende y aprovisiona **espacios** (tenants). Cada espacio es una organización educativa con su propio dominio, marca, usuarios, roles, configuración y datos aislados.

## Tres niveles
| Nivel | Quién | Dónde entra | Qué hace |
|---|---|---|---|
| 1. Plataforma | Operador Edukana (dueño, soporte, ventas) | `app.edukana.com/platform` | Crea y vende espacios, define planes, límites, facturación SaaS, soporte, suplantación auditada |
| 2. Espacio (tenant) | Personal de la organización | `{slug}.edukana.com` o dominio propio | Configura y opera su institución con su marca |
| 3. Usuario final | Estudiantes, tutores, compradores | El mismo dominio del espacio | Aprende, consulta, paga |

## Tipos de espacio
El tipo es un **preset**: define terminología, módulos activos, roles disponibles, navegación y valores por defecto. Todo es ajustable después por el operador (módulos y límites) y por el administrador del espacio (parámetros).

| Tipo | Ejemplo | Estructura académica | Rasgos |
|---|---|---|---|
| `SCHOOL` | Colegio inicial, primaria, secundaria | Año escolar → períodos → grado → sección → asignaturas | Tutores, asistencia diaria, boletín, conducta, mensualidades |
| `UNIVERSITY` | Universidad | Facultad → carrera → plan de estudios → asignatura → sección por semestre | Créditos, prerrequisitos, inscripción de materias, índice académico, kardex |
| `INSTITUTE` | Instituto técnico, academia de idiomas, centro de formación | Programa → nivel o módulo → cohorte | Cohortes con fecha, cuotas, certificados, admisiones comerciales |
| `MARKETPLACE` | Academia en línea que vende cursos | Categoría → curso → oferta a ritmo propio | Catálogo público, carrito, cupones, reseñas, instructores con comisión |

Un espacio puede activar módulos de otro tipo (por ejemplo un instituto que además vende cursos en línea activa `catalog`).

## Terminología por tipo
La interfaz nunca escribe estos términos fijos: los lee de `tenant.terminology` (editable).

| Clave | SCHOOL | UNIVERSITY | INSTITUTE | MARKETPLACE |
|---|---|---|---|---|
| `learner` | Estudiante | Estudiante | Participante | Alumno |
| `teacher` | Docente | Profesor | Instructor | Instructor |
| `course` | Asignatura | Asignatura | Módulo | Curso |
| `offering` | Sección | Sección | Cohorte | Edición |
| `term` | Período | Semestre | Ciclo | — |
| `year` | Año escolar | Año académico | — | — |
| `program` | Nivel | Carrera | Programa | Ruta |
| `group` | Grado y sección | Cohorte de ingreso | Grupo | — |
| `guardian` | Tutor | Contacto de emergencia | Responsable de pago | — |
| `reportCard` | Boletín | Récord de notas | Reporte de progreso | — |

## Principios de experiencia
1. Cada persona ve solo lo que necesita y sabe qué hacer ahora.
2. Mínimo privilegio y mínima información en todas las capas.
3. La identidad se deriva de la sesión; nunca se vuelve a pedir.
4. Una acción principal por pantalla; el resto bajo divulgación progresiva.
5. La marca visible es la del espacio, no la de Edukana (salvo "Con tecnología de Edukana" según plan).
6. Un usuario nuevo completa su tarea sin capacitación.

## Fuera de alcance por ahora
Aplicaciones nativas, videoconferencia propia, supervisión de exámenes con cámara, nómina, biblioteca física, transporte.
