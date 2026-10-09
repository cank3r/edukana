# Asistente de IA (M15)

Dos funciones pequeñas sobre el contenido de los cursos, con la API de Anthropic (`@anthropic-ai/sdk`).

## Qué hace

- **Docente: «Generar preguntas con IA»** (`/dashboard/aula/[courseId]/generar-preguntas`, enlazado desde «Contenido del curso» y desde la vista previa de cada lección). Elige una lección o un capítulo, cuántas preguntas (3–10) y el tipo (opción múltiple, respuesta corta o mezcla). La IA propone preguntas en JSON, que se validan con Zod (`src/server/ai/parse.ts`); si la respuesta viene mal formada se rechaza con un mensaje claro. El docente las revisa, corrige o descarta, y solo las que guarda entran al banco del curso por `createQuestion` de `src/server/assessment/question-bank.ts` (mismas validaciones y permisos que «Agregar pregunta»). Nunca se guarda nada sin revisión.
- **Estudiante: «Pregúntale al curso»** (debajo de cada lección, solo en modo estudiante). Responde usando solo las lecciones publicadas de capítulos publicados del curso en el que está inscrito (matrícula activa o completada, curso publicado y sin archivar, su institución). El contexto se recorta (8 000 caracteres por lección, 40 000 en total, la lección actual primero). Cita la lección de donde sale la respuesta; solo se aceptan citas a lecciones que se enviaron. Si no está, responde «No está en el curso; pregúntale a tu docente». No se guarda historial.

## Seguridad

- Las instrucciones del sistema son fijas. El texto del estudiante y el de las lecciones van en el mensaje del usuario dentro de etiquetas y con `<`/`>` neutralizados: se tratan como datos.
- Permiso `ai.use` (docente y estudiante por omisión; el coordinador puede recibirlo en «Roles y permisos»). Generar preguntas además exige poder gestionar el curso.
- El administrador puede apagar la IA para toda la institución en Configuración → Datos de la institución → «Asistente de IA». Se guarda en `Institution.settings.ai.enabled` (sin migración) y queda en la bitácora (`AI_SETTING_UPDATED`).
- Límite por persona: 20 pedidos por hora (`AI_MAX_REQUESTS_PER_HOUR`), con la tabla del límite de inicio de sesión y un HMAC propio.
- Registro de uso en la bitácora (`AI_USED`): persona, curso, función, modelo, tokens y resultado. Nunca el texto enviado ni la respuesta.

## Configuración

| Variable | Obligatoria | Por defecto |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sí, para encender la IA | — (sin ella, la IA aparece desactivada y nada falla) |
| `AI_MODEL` | No | `claude-sonnet-5-5` |
| `AI_MAX_REQUESTS_PER_HOUR` | No | `20` |

## Código

- `src/server/ai/client.ts`: interfaz `AiClient` y cliente de Anthropic; `setAiClientForTests` para inyectar uno falso (las pruebas no llaman a la API real).
- `src/server/ai/prompts.ts`: instrucciones y armado del contexto (puro).
- `src/server/ai/parse.ts`: validación Zod de la salida.
- `src/server/ai/access.ts`: disponibilidad, ajuste de la institución, límite y registro de uso.
- `src/server/ai/course.ts`: preguntar al curso, generar y guardar preguntas.
- `src/server/actions/ai.ts`: server actions.
- Pruebas: `tests/ai.test.ts` (unitarias) y `tests/integration/ai.test.ts`.
