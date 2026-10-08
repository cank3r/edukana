# Revisión independiente de S0 — Edukana

**Objeto fijo:** [`0e67a916b03083b22d4142f0a56b5635ba145c52`](https://github.com/cank3r/edukana/commit/0e67a916b03083b22d4142f0a56b5635ba145c52).
**Fecha:** 2026-10-08 UTC. **Revisor:** Codex. **Claim:** S0-CODEX-REVIEW.
**Rama propia:** `codex/s0-independent-review`.
**Autorización delimitada:** [registro existente en PR #2](https://github.com/cank3r/edukana/pull/2#issuecomment-6054480829), exclusivamente este archivo.

## Dictamen y alcance

**S0 no reúne todavía las condiciones escritas para declararlo cerrado.** Hay un defecto bloqueante en el nuevo runner: cinco llamadas pasan una expresión regular donde Playwright exige una cadena. Lo reproduje con el validador del paquete exacto 1.64.0. Además, la aceptación desplegada S0-12 sigue BLOCKED y varios documentos de S0 contradicen las decisiones rectoras.

La dirección aprobada sí queda clara en `current-state.md` y PLAN: S1 seguridad, S2 identidad, S3 estructura, S4 semana híbrida. La ausencia actual de Membership, Offering, ClassSession, bootstrap con token e historia académica **no se presenta como una implementación que S0 deba incorporar ahora**. Las correcciones documentales y del runner pertenecen a S0; las capacidades planificadas conservan su sprint.

La revisión abarca seguridad adversarial, UX, lenguaje, casos límite, coordinación y calidad de evidencia. No es una revisión formal de GitHub, aprobación del PR, auditoría exhaustiva ni certificación de producción. No adopta el veredicto de Claude.

## Procedencia, aislamiento y método

- Leídos en el orden solicitado: `TEAM-COORDINATION.md`, `.kiro/steering/current-state.md`, `.kiro/steering/simplicity.md` y `.kiro/PLAN.md`, primero desde GitHub fijado al SHA y después contrastados con el checkout.
- Consultado `AGENTS.md`. Se inventariaron las dos habilidades de `.agents/skills`: Prisma Composer y Prisma Platform. Sus ámbitos de operación/despliegue no se aplicaron a esta revisión del ORM 5.22; no se ejecutó sincronización de habilidades ni infraestructura.
- Se utilizó un checkout aislado en el equipo autorizado. Se clonó la **rama remota existente**; no se recreó la rama ni el claim. HEAD y la referencia remota de revisión eran el SHA solicitado, con árbol limpio antes de escribir.
- `git merge-base --is-ancestor cff38c6 HEAD` devolvió 0. `git diff cff38c6..HEAD -- src prisma .circleci` quedó vacío. S0 añade documentación, runner/pruebas y cambios de dependencias; los problemas del código académico y de bootstrap aquí descritos son anteriores a S0.
- La terminal inicial falló; la ejecución se recuperó en el mismo equipo sin cambiar permisos.
- Herramientas observadas: Git, Node, npm y pnpm; `rg` no disponible, se usó `git grep`. Node local: **24.14.0**; el proyecto exige **22.x**. No se instalaron dependencias en el repositorio.
- Se descargaron únicamente los archivos de distribución de `zod@4.6.5` y `playwright-core@1.64.0` indicados por el lockfile. Se verificó SHA-512 contra `integrity` antes de extraerlos en `%TEMP%\edukana-s0-review-0e67a91`; no se ejecutaron hooks de instalación ni se descargaron navegadores.
- No se leyeron archivos de secretos ni datos reales de alumnos. No hubo conexión de las pruebas a DB, Storage, Preview o producción; tampoco reset, migraciones, despliegue, merge o cambios de permisos.
- **Único archivo de entrega y cambio versionable:** `docs/reviews/s0-independent-review.md`. Helpers y paquetes temporales son instrumentación de pruebas fuera del repositorio.

### Qué significa cada evidencia

**Ejecutada** significa que se invocó la función o prueba indicada. Las pruebas que leen texto fuente siguen siendo comprobaciones estáticas aunque su runner termine verde. **Inspección** significa lectura de código/documentos. **Declarada** es una afirmación de otro documento o autor, no repetida aquí. **Pendiente** significa que no se ejecutó y no tiene resultado.

## Matriz de aceptación de los ocho puntos

| Punto | Criterio de aceptación | Declaración documental | Verificación independiente en el SHA | Resultado / condición |
|---|---|---|---|---|
| 1. Código, steering y roadmap | Una secuencia vigente y separación explícita entre construido y futuro | [PLAN 38–43][plan-sprints] ordena S1→S2→S3→S4. [Estado 18–25][state-current] describe legacy | El esquema conserva User institucional, Course unido y ScheduleSlot. Manual §27, blueprint §26 y catálogo §31 recomiendan híbrido primero. Hay frases de cambios sin commit ya versionados | **Parcial; Importante I1/I3.** Corregir referencias rectoras antes de entregar S0 |
| 2. Tres ejes de ClassSession | Participación, temporalidad y tipo pedagógico independientes, con combinaciones válidas definidas | [Estado 34][state-class] y [data-model 52–58][model-class] los separan | [Blueprint 263–271][blueprint-mode] y [catálogo 803][catalog-mode] los mezclan en “Modalidad”. No hay ClassSession en el esquema actual | **Contrato documental incoherente; Importante I2.** Conciliar en S0, implementar en S4 |
| 3. Rechazo de producción por runner | Rechazo antes de escrituras y vínculo comprobable con recursos aislados | Guion dice que exige host Preview; estado promete allowlist DB/Storage futura | 4/4 pruebas del runner; 14 casos sintéticos. Rechaza alias de producción convencional, HTTP, host distinto, credenciales/query/fragmento. Acepta recursos ficticios etiquetados producción porque no los comprueba | **Parcial; Importante I4.** La forma del host no certifica aislamiento. El E2E además tiene B1 |
| 4. Plan de protección de /setup | Bootstrap de un uso, consumo atómico, cierre por defecto y pruebas adversariales | [Estado 44][state-security], [PLAN 38][plan-sprints] y handoff 51 lo asignan a S1 | Página comprueba count; acción usa transacción Serializable, pero ningún token. Ver [setup 18–56][setup-action] | **Plan presente; protección pendiente en S1. Importante I5.** No exponer una base vacía asumiendo que ya está protegido |
| 5. URLs emitidas tras revocar | Distinguir nueva autorización de descarga ya firmada; medir ventana por backend | Estado 45 reconoce ventana residual; catálogo promete cortar “todo acceso” inmediatamente | API firma 300 s; token local sigue válido hasta el vencimiento. No consulta revocación durante GET local. No se midió Supabase | **Promesa excesiva; Importante I6.** Documentar TTL real en S0; cierre técnico/medición en S1 |
| 6. Preguntas, reenvíos y notas | Historia estable con actor, motivo y fecha; preservar contenido evaluado | Estado 46 y PLAN S1 lo exigen | Submission se sobrescribe; GradeEntry conserva última nota; preguntas/answers referencian banco vivo sin snapshot. Inspección, sin mutaciones DB | **Deuda legacy explícita para S1; Importante I7.** No exigir migrarla en S0 ni declarar resuelto |
| 7. Ediciones simultáneas de contratos | Un escritor verificable y handoff explícito; REVIEW no libera el claim | TEAM prohíbe solapes y enumera contratos | Handoff permite interpretar REVIEW como permiso; registrar filas en ramas separadas no arbitra una carrera de claims | **Protocolo parcial; Importante I8.** Corregir ambigüedad y establecer confirmación remota antes de escribir |
| 8. Simplicidad de pantallas | Español cotidiano, confirmación/impacto y evidencia a 360 px, teclado y tiempos | [simplicity 7–35][simplicity] define la aceptación | UX 11/11: 3 pruebas de funciones y 8 de strings. Sidebar/select móvil tienen medidas positivas; hay texto técnico y publicación directa. No se renderizó la app | **Aceptación no demostrada; Importante I9, Recomendación R1.** Mantener evidencia de fuente separada de usabilidad real |

## Hallazgos

### B1 — Bloqueante: el runner usa RegExp en selectOption

**Ruta y líneas:** [`tests/e2e/canonical-pilot.spec.mjs:94`][runner-regex]; también 136, 155–156 y 234 del mismo archivo. Introducido en S0.

**Verificado:** pasa `{ label: new RegExp(...) }` o `{ label: /Asignaciones/ }`. El esquema `FrameSelectOptionParams` del paquete fijado `playwright-core@1.64.0` exige `label: tString`. Una reproducción sin navegador, exponiendo ese validador solo en memoria, rechazó ambos tipos de RegExp con:

```text
synthetic.options[0].label: expected string, got object
```

El control positivo `label: "Asignaciones"` fue aceptado. Es consistente con la [API oficial de Playwright](https://playwright.dev/docs/api/class-locator#locator-select-option). Esto valida el rechazo del argumento, **no constituye una ejecución del E2E**.

**Impacto:** si el recorrido llega a la asignación de persona de la línea 94, no puede continuar por esa llamada; las demás repiten el defecto. Las 87 pruebas de `npm test` no incluyen este recorrido de navegador y no lo detectan.

**Corrección esperada, dueño Kiro/S0:** seleccionar por valor estable o por texto exacto; si hace falta coincidencia parcial, localizar una opción y obtener su value antes de llamar a selectOption. Cubrir las cinco llamadas y ejecutar después el recorrido completo en el entorno aislado autorizado. No relajar el validador ni esconder la excepción.

### I1 — Importante: tres documentos recomiendan una secuencia distinta de PLAN

**Rutas y líneas:** [`docs/as-built-system-manual.md:1291–1306`][manual-next], [`docs/detailed-functional-blueprint.md:925–959`][blueprint-order], [`docs/screen-action-catalog.md:1091–1104`][catalog-next], frente a [`.kiro/PLAN.md:38–43,51–54`][plan-sprints].

**Inspección:** el manual presenta la semana híbrida como siguiente incremento y deja recuperación/importación para después. El blueprint antepone sesiones y Panel Hoy a recuperación e identidad. El catálogo manda implementar esas pantallas a continuación. PLAN prioriza seguridad e identidad, después estructura y finalmente híbrido.

**Impacto:** un integrador que siga los manuales puede empezar contratos de S3/S4 antes de las dependencias aprobadas. Que TEAM establezca precedencia reduce la ambigüedad normativa, pero no elimina instrucciones contradictorias publicadas por S0.

**Corrección esperada, S0 documental:** hacer que esos apartados remitan a PLAN y marquen su orden anterior como sustituido; mantener los detalles funcionales como objetivos de S4. No adelantar ClassSession ni modificar esquema. Distinguir fases generales del [roadmap 68–99][roadmap] de sprints y aclarar que la conservación mínima de historia ya corresponde a S1.

### I2 — Importante: los formularios futuros vuelven a mezclar los tres ejes de ClassSession

**Rutas y líneas:** [`docs/detailed-functional-blueprint.md:261–284,299–303`][blueprint-mode], [`docs/screen-action-catalog.md:798–807`][catalog-mode]; contraste [`.kiro/steering/current-state.md:34`][state-class] y [`.kiro/steering/data-model.md:52–58`][model-class].

**Inspección:** una sola lista contiene presencial, virtual, híbrida, asincrónica, práctica, evaluación y evento. El contrato rector separa cómo participa la persona, cuándo participa y qué actividad hace. “Práctica híbrida sincrónica” necesita conservar tres valores simultáneos.

**Impacto:** implementar el catálogo literalmente forzaría opciones excluyentes y perdería información o produciría migraciones incompatibles.

**Corrección esperada:** alinear blueprint y catálogo en S0; en la spec READY de S4 definir campos separados, defaults y combinaciones admitidas, disponibilidad asincrónica, zona horaria y cambios por sesión. Acordar el nombre definitivo del enum antes de migrar; cambiar `PRESENTIAL` por `IN_PERSON` es una decisión de nomenclatura, no un defecto de comportamiento demostrado. La ausencia de ClassSession en [`prisma/schema.prisma:624–642`][schedule] es coherente con el estado legacy.

### I3 — Importante: la fuente de estado describe como locales cambios que ya contiene el commit

**Rutas y líneas:** [`.kiro/steering/current-state.md:16,25`][state-current], [`docs/as-built-system-manual.md:19–34`][manual-state]; resultados en [`PLAN:27`][plan-s0] y [`manual:1127–1133`][manual-evidence].

**Verificado:** el checkout y la rama remota de revisión apuntaban a 0e67a916; ese commit ya contiene runner, dependencias y documentación. Son obsoletas las frases “último commit cff38c6” y “cambios todavía sin commit”. No se deduce de ello qué SHA se ejecutó en cada Preview.

**Impacto:** dificulta reproducir la base y puede hacer que se atribuyan pruebas o ausencia de despliegue al commit equivocado.

**Corrección esperada, S0:** redactar esas secciones como estado histórico fechado o eliminar el estado Git efímero; vincular cada evidencia a SHA, comando, entorno y resultado. El conteo de **87 pruebas sí coincide** con las declaraciones encontradas y con las pruebas ejecutadas aquí; no se denuncia como conteo falso. Build 22/22, auditoría cero, types/lint y el E2E local previo quedan como resultados **declarados**, no revalidados por esta revisión.

### I4 — Importante: la protección del runner valida un nombre, no la identidad del entorno

**Rutas y líneas:** [`scripts/canonical-pilot-config.mjs:19–35,54–70`][runner-config], [`tests/canonical-pilot-runner.test.mjs:24–29`][runner-test], [`docs/canonical-mvp-pilot.md:84–101`][pilot-runner]; plan futuro en [`current-state:44`][state-security].

**Ejecutado:** el validador rechaza el alias convencional `edukana.vercel.app`; también host diferente, HTTP, credenciales, query y fragmento. Pero con host sintético permitido acepta `PILOT_ENVIRONMENT=production`, DB ficticia en `production.invalid` y Storage ficticio en ese dominio: estos campos se ignoran. No se resolvió ni contactó ninguno de esos hosts. También acepta puerto 444 y descarta un pathname al devolver `origin`; la comparación es de hostname, no de origen completo.

**Impacto:** repetir el hostname en dos variables es confirmación de intención, no prueba de que un deployment Preview use recursos de staging. Un deployment de producción nombrado con `-git-` o un Preview conectado a recursos compartidos no queda descartado por esta función. No se afirma que Edukana esté actualmente mal conectado.

**Corrección esperada:** S0 debe describir el alcance exacto de la guarda y exigir verificación independiente del deployment, DB y bucket antes de un run con escrituras. S1 implementa la allowlist prometida, con identidad obtenida del entorno servidor, no solo valores autodeclarados por el cliente; rechazo por defecto y antes de `/setup`. Fijar origen/puerto y evitar seguir redirecciones inesperadas debe entrar en ese criterio. **No se exige introducir esa infraestructura en este informe ni en S0 documental.**

### I5 — Importante: /setup sigue siendo un bootstrap público mientras la base esté vacía

**Rutas y líneas:** [`src/app/setup/page.tsx:7–17`][setup-page], [`src/app/setup/actions.ts:18–56`][setup-action], [`docs/as-built-system-manual.md:1249–1251`][manual-setup]; [`PLAN:38`][plan-sprints].

**Inspección:** la acción valida datos y crea institución/admin cuando el count es cero. La transacción Serializable y manejo P2034 protegen la concurrencia de inicialización; no se demostró doble creación. No hay requisito de token de bootstrap ni autenticación del iniciador.

**Impacto:** quien complete primero el formulario de un despliegue accesible y vacío puede obtener el primer administrador. “Ejecutarlo antes de compartir” no es un mecanismo de autenticación.

**Corrección esperada:** mantenerlo como deuda S1 reconocida. La spec debe cubrir token de un solo uso con caducidad, consumo atómico, estado deshabilitado por defecto, replay/concurrencia, ausencia de filtrado a URL/log y cierre posterior. Antes de resetear/exponer staging, el coordinador debe garantizar aislamiento y acceso restringido con autorización específica. Nada de eso fue ejecutado por esta revisión.

### I6 — Importante: “revocación inmediata de todo acceso” no describe URLs ya emitidas

**Rutas y líneas:** [`docs/screen-action-catalog.md:342`][catalog-revoke], [`src/app/api/assets/[assetId]/route.ts:9–35`][asset-route], [`src/lib/storage.ts:88–97`][storage-url], [`src/app/api/local-storage/route.ts:23–32,50–65`][local-route], [`src/lib/local-storage.ts:14–27`][local-token].

**Inspección y ejecución:** la autorización precede a la emisión de URL por 300 segundos. El acceso posterior del backend local comprueba firma, ruta y vencimiento, sin consultar sesión ni vínculo. Con un token sintético emitido en t=0, fue válido en t=1 s, t=299.999 s y t=300 s; expiró en t=300.001 s. La comparación usa `expiresAt < now`, por lo que el instante exacto del vencimiento todavía pasa.

El portal y la audiencia vuelven a filtrar vínculos activos ([`guardian-portal.ts:34–47`][guardian-read], [`announcement-data.ts:30–39`][announcement-read]). Eso puede cerrar nuevas autorizaciones del tutor sin invalidar una firma previamente entregada. La llamada a Supabase solicita el mismo TTL, pero **no se midió su ventana efectiva, caché ni una revocación real**. El ensayo local no representa una prueba de Supabase.

**Impacto:** una copia de la URL puede continuar habilitando una descarga durante el tiempo restante; revocar no recupera bytes ya descargados. La promesa categórica del catálogo excede el contrato correcto de `current-state:45`.

**Corrección esperada:** precisar en S0 “bloquea nuevas autorizaciones; enlaces emitidos tienen una ventana residual nominal de hasta 300 s desde emisión”. En S1 medir ambos backends con revocación real, decidir TTL por sensibilidad y, si un caso exige revocación por petición, diseñar mediación que consulte autorización. No afirmar revocación criptográfica inmediata ni una medición remota inexistente.

### I7 — Importante: la historia académica prometida aún no se conserva en el modelo legacy

**Rutas y líneas:** [`src/app/dashboard/academico/actions.ts:180–207`][academic-history], [`actions.ts:236–268`][exam-history], [`prisma/schema.prisma:437–454`][grade-model], [`schema.prisma:488–533`][submission-model], [`schema.prisma:566–620`][exam-model]; compromiso [`current-state:46`][state-security] y [`PLAN:38`][plan-sprints].

**Inspección:**

- Reenviar una tarea actualiza el mismo Submission y borra su score, feedback y gradedAt; no conserva el contenido anterior como intento. La misma acción no actualiza el GradeEntry anterior, por lo que el estado de ambas representaciones también debe definirse.
- Calificar vuelve a actualizar Submission y hace upsert del GradeEntry. Conserva actor/fecha de la última calificación, no versiones ni motivo de cada modificación.
- ExamAttempt sí distingue número de intento y ExamAnswer guarda respuesta/puntuación. Sin embargo, ExamQuestion y ExamAnswer referencian QuestionBankItem; no guardan copia de prompt/opciones/clave. La corrección usa el banco actual.
- No se encontró en las acciones académicas inspeccionadas una operación de edición del banco que demuestre una alteración retroactiva ya explotable. La falta de snapshot es una brecha del contrato de conservación, no prueba de que se haya modificado una pregunta usada.

**Impacto:** no puede reconstruirse completamente qué se entregó y quién cambió una nota con su motivo; ampliar edición de preguntas sin inmovilización agravaría el problema.

**Corrección esperada en S1:** revisiones inmutables o eventos asociados a los identificadores académicos estables, snapshot/inmovilización de pregunta usada, actor/motivo/fecha y política explícita de reenvío/recalificación. Probar transacciones y concurrencia reales; conservar intentos y definir qué nota se publica mientras se revisa el reenvío. Mantener separado el historial mínimo de S1 del boletín/cierre de S6 y de la migración Course/Offering de S3. **No se solicita modificar schema ni acciones en S0.**

### I8 — Importante: REVIEW se puede interpretar como liberación de archivos y los claims no tienen arbitraje explícito

**Rutas y líneas:** [`docs/claude-s0-handoff.md:31–38`][handoff-claim], [`TEAM-COORDINATION.md:38–56,62`][team-protocol] y [`TEAM:93–100`][team-contracts].

**Inspección:** TEAM exige esperar handoff ante solape y define REVIEW como terminado/esperando revisión. El handoff dice no editar hasta que cambie a REVIEW **o** se reciba handoff. S0-GOV ya está en REVIEW y conserva alcance exclusivo. Además, leer ausencia de claim y escribir una fila local en ramas distintas puede dar dos reservas simultáneas; no se designa un punto de confirmación remota.

**Impacto:** dos agentes pueden creer que tienen permiso sobre el mismo contrato aunque cada uno siga parte de la documentación. Las ramas aisladas evitan pisar un checkout, pero no eliminan divergencias del contrato compartido.

**Corrección esperada en S0:** aclarar que REVIEW no libera escritura; propietario/coordinador confirma explícitamente la transferencia, con SHA, alcance y próximo escritor. Identificar dónde se consulta el registro autoritativo y exigir confirmación publicada antes de editar; ante una carrera, el segundo espera. Basta un procedimiento sencillo y verificable, no se propone construir un sistema de bloqueos. La excepción de Carlos para este único informe ya resuelve nuestro solape documental y no autoriza otras ediciones.

### I9 — Importante: hay incumplimientos visibles de lenguaje/confirmación y no existe aceptación UX ejecutada

**Rutas y líneas:** [`src/app/setup/page.tsx:15`][setup-page], [`src/components/dashboard/AcademicForms.tsx:13–18,38–39,77–82,105–113`][academic-ui]; reglas [`simplicity.md:7–30`][simplicity]; evidencia [`tests/ux.test.ts:33–88`][ux-tests].

**Inspección:** setup habla de “base de datos”, “seed” y “SQL manual”; el horario pide minutos desde 00:00 en vez de una hora; una carga puede mostrar “Supabase rechazó” y la ruta `/api/assets/<id>`. PublishForm envía directamente publicar/retirar mediante el Form genérico, sin revisión de impacto/confirmación. Son ejemplos concretos de deuda legacy, no cambios introducidos por S0.

AttendanceForm, **línea 39 en este SHA**, impone `min-w-[520px]` dentro de `overflow-x-auto`, sin alternativa móvil en ese componente. La declaración CSS contradice el objetivo de operar a 360 px sin una tabla que obligue a desplazamiento lateral. Esto es evidencia estática del diseño previsto; no se midió el ancho efectivo ni se observó un navegador renderizado. El default `PRESENT` sí coincide con registrar solo excepciones de asistencia.

**Evidencia positiva:** Sidebar usa etiquetas, navegación móvil y `min-h-11`; CourseTabs ofrece select móvil con label; formularios anuncian mensajes con aria-live. Sus fuentes respaldan intención de accesibilidad, no medidas de pantalla renderizada.

**Impacto:** aumenta la carga para personas no técnicas y permite publicar notas/tareas sin la confirmación que ahora exige el contrato de experiencia.

**Corrección esperada:** inventariar estas excepciones en S0 y asignar su corrección al recorrido correspondiente; antes de aceptar esa pantalla, usar hora legible, errores que indiquen el siguiente paso y resultado de carga por nombre, mostrar impacto antes de publicar y ofrecer filas/tarjetas de asistencia que quepan en móvil. Verificar 360 px, teclado y persistencia en app real. No se afirma haber visto desbordamientos, medido controles de 44 px o cronometrado tareas; esos ensayos están pendientes.

### R1 — Recomendación: convertir la puerta de simplicidad y aislamiento en evidencia de comportamiento

**Rutas y líneas:** [`tests/ux.test.ts:33–88`][ux-tests], [`.circleci/config.yml:5–30`][ci], [`tests/e2e/canonical-pilot.spec.mjs:212–256`][runner-final], [`docs/canonical-mvp-pilot.md:58–64,99–101`][pilot-negatives].

**Verificado/inspeccionado:** UX tiene 11 pruebas; ocho leen strings de archivos. Las otras tres comprueban helpers de navegación/etiquetas. Permisos usa MemoryPermissionStore, políticas construyen filtros y schema lee texto; no ejecutan el SQL real. CircleCI define un contenedor Node y variables de DB, sin servicio PostgreSQL ni ejecución del runner Preview. El E2E limita el escenario a una institución y un destinatario de cada rol; no revoca el vínculo y declara pendientes segundo tenant y destinatario externo.

**Impacto:** resultados verdes ayudan a detectar regresiones del código esperado, pero no prueban aislamiento DB, denegación HTTP sin datos, revocación real, renderizado a 360 px, recorrido por teclado ni éxito de una persona nueva en un minuto.

**Corrección esperada:** conservar estas pruebas como regresión y nombrarlas correctamente. En S1 añadir integración PostgreSQL con dos instituciones y casos sin permiso/ID ajeno; para UX medir tareas y dimensiones sobre interfaz real por rol, incluidos vacíos, errores y confirmaciones. Registrar resultados y artefactos vinculados al SHA y al entorno. No convertir “se encontró la palabra” en “el usuario pudo hacerlo”.

### R2 — Recomendación: parametrizar el navegador antes de llevar el piloto a CI

**Ruta y líneas:** [`playwright.pilot.config.mjs:16–23`][playwright-config].

**Inspección:** fija `Desktop Edge` y `channel: "msedge"`. Es consistente con el guion actual de Edge del sistema, pero no hay instalación de ese canal en la configuración de CircleCI inspeccionada. No se ejecutó una reproducción Linux.

**Impacto:** incorporar el runner a CI tal cual añade una dependencia de navegador externo que no declara el job.

**Corrección esperada en la integración S1:** canal configurable y navegador instalado/versionado de manera reproducible; conservar Edge si se requiere para aceptación específica. Esto no demuestra que falle en el equipo Windows actual.

### Q1 — Pregunta: ¿qué cierre exacto se espera para S0-GOV frente a S0-12?

**Rutas y líneas:** [`.kiro/PLAN.md:30–32,51–54`][plan-s0], [`TEAM-COORDINATION.md:53–55,62,68`][team-protocol] y [`docs/as-built-system-manual.md:1334–1368`][manual-done].

**Inspección:** S0-12 sigue BLOCKED, S1 depende de S0 y TEAM define DONE como fusionado y verificado. La documentación exige E2E desplegado para una salida. La aprobación de otra revisión no cambia esas condiciones.

**Impacto:** declarar S0 DONE sin decidir qué sucede con S0-12 puede habilitar S1 bajo una dependencia incumplida.

**Resolución esperada del coordinador/Carlos:** cerrar la aceptación desplegada con evidencia, o registrar explícitamente una redefinición de salida/traslado de S0-12 y sus riesgos. Este informe no toma esa decisión ni autoriza reset, merge o despliegue.

## Pruebas ejecutadas y resultados

### Registro de ejecución

| ID | Comando/método | Resultado observado | Qué demuestra / límite |
|---|---|---|---|
| T1 | `git rev-parse HEAD`, `git status --short --branch`, `git ls-remote` | SHA exacto; rama propia y árbol inicialmente limpio | Aislamiento y base; no estado del checkout de Kiro, que no se operó |
| T2 | `git merge-base --is-ancestor cff38c6 HEAD`; `git diff cff38c6..HEAD -- src prisma .circleci` | Exit 0; diff vacío | Problemas de esos archivos preceden S0 |
| T3 | `node --test tests/canonical-pilot-runner.test.mjs` | **4/4 PASS**, exit 0 | Validador local, sin navegación |
| T4 | Node 24 + resolvedor temporal; ocho suites indicadas abajo | **58/58 PASS**, exit 0 | Funciones puras, MemoryPermissionStore y comprobaciones de fuente |
| T5 | Mismo resolvedor + Zod exacto verificado; security y announcements | **25/25 PASS**, exit 0 | Completa las **87/87 pruebas existentes**, con runtime distinto del oficial |
| T6 | Importar loadCanonicalPilotConfig e invocarlo con 14 entradas sintéticas | **14 resultados observados y afirmados**, exit 0 | 10 rechazos y 4 aceptaciones; aceptación de recursos ignorados expone límite, no un PASS de seguridad |
| T7 | signLocalStorageToken/verifyLocalStorageToken, reloj sintético | **6 aserciones PASS**, exit 0 | Cuatro momentos válidos, uno expirado y rechazo de ruta alterada; no revocación DB ni Supabase |
| T8 | Validador FrameSelectOptionParams de Playwright 1.64.0, exportado en memoria | **2 RegExp rechazados + 1 string aceptado**, exit 0 | Confirma B1 sin navegador, DOM ni servidor |
| T9 | `git diff --check` antes del informe y `git diff --cached --check` antes de commit | Exit 0 | Higiene del diff, no corrección funcional |

T4 ejecutó `permissions` (10), `course-scope` (5), `guardianship` (11), `lms` (8), `schema` (6), `ux` (11), `local-storage` (2) y `canonical-pilot` (5). T5 ejecutó `security` (11) y `announcements` (14). Junto con T3 son 87 casos únicos; no se suman dos veces por repetir una suite.

No se ejecutó `npm test` literalmente: se ejecutaron todos los archivos que enumera con Node 24, su eliminación nativa de anotaciones TypeScript y resolución temporal. No se reescribieron los archivos ni se sustituyeron funciones de negocio; el resolvedor solo añade extensiones, resuelve `@/` y apunta `zod` al paquete temporal íntegro. Los imports `type` se eliminan, por lo que estas pruebas no necesitan generar Prisma Client; no hay validación de tipos. Esto no sustituye la puerta prescrita Node 22/tsx ni una instalación completa.

**Incidencias de instrumentación, resueltas:** el primer intento de T4 pasó una ruta Windows a `--import` y falló antes de cargar las ocho suites (`ERR_UNSUPPORTED_ESM_URL_SCHEME`); se repitió con URI file y pasó. La primera instrumentación de T8 ya rechazó RegExp pero su control positivo falló por faltar `context.isUnderTest`; con ese callback requerido, los tres controles pasaron. No se atribuyen esos fallos del harness al producto. Hubo además una búsqueda de archivos de Playwright en una estructura anterior; se localizó su bundle real sin modificarlo en disco.

### Reproducción del entorno alternativo

El resolvedor temporal usado no cambia lógica del producto ni mocks de negocio:

```javascript
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve, extname } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "zod")
      return nextResolve(new URL("./zod/package/index.js", import.meta.url).href, context);
    if (specifier.startsWith("@/"))
      return nextResolve(pathToFileURL(resolve(process.cwd(), "src", specifier.slice(2) + ".ts")).href, context);
    if (specifier.startsWith(".") && !extname(specifier))
      return nextResolve(specifier + ".ts", context);
    return nextResolve(specifier, context);
  },
});
```

Desde el checkout, con ese archivo en el directorio temporal y Zod extraído a su lado:

```powershell
$reviewScratch = Join-Path $env:TEMP 'edukana-s0-review-0e67a91'
$reviewLoader = ([Uri](Join-Path $reviewScratch 'resolve-ts.mjs')).AbsoluteUri
node --test tests/canonical-pilot-runner.test.mjs
node --import $reviewLoader --test tests/permissions.test.ts tests/course-scope.test.ts tests/guardianship.test.ts tests/lms.test.ts tests/schema.test.ts tests/ux.test.ts tests/local-storage.test.ts tests/canonical-pilot.test.ts
node --import $reviewLoader --test tests/security.test.ts tests/announcements.test.ts
```

T6 usó un objeto explícito, no `process.env`, con cuatro correos `@pilot.test`, contraseña sintética y host `edukana-git-synthetic-example.vercel.app`. Resultado:

| Variante | Resultado |
|---|---|
| Host de forma Preview | Aceptada |
| Alias `edukana.vercel.app`; dominio `school.example`; HTTP; host diferente | Rechazadas (4) |
| Credenciales en URL; query; fragmento; confirmación incorrecta; correo duplicado sin distinguir mayúsculas; scratch vacío | Rechazadas (6) |
| Campos extra `PILOT_ENVIRONMENT=production`, DB/Storage en `production.invalid` | Aceptada; campos ignorados |
| Puerto 444 | Aceptada |
| Pathname `/not-root` | Aceptada; origin devuelto sin pathname |

T7 usó `expiresAt=301000`, emisión lógica en 1000 y `now=[1000,2000,300999,301000,301001]`; devolvió `[true,true,true,true,false]`. Cambiar solo objectPath devolvió false.

Para T8, se cargó en un módulo temporal en memoria el texto verificado de `playwright-core/package/lib/coreBundle.js`, añadiendo únicamente:

```javascript
init_validator();
module.exports.reviewValidator = findValidator("Frame", "selectOption", "Params");
```

Se invocó ese validador con `{selector:"select",options:[{label}]}` y contexto `{isUnderTest:()=>false}`: `/Asignaciones/` y `new RegExp("Docente Piloto")` fallaron; `"Asignaciones"` pasó. No se ejecutó código del E2E ni interacción con un sitio.

### No ejecutado y límites

| Comprobación | Estado / motivo |
|---|---|
| Puerta oficial con Node 22 y tsx | No ejecutada; runtime disponible Node 24 y checkout sin node_modules |
| Prisma validate/generate, typecheck, lint, build, npm audit | No ejecutados; no se instaló el árbol completo. Los PASS de documentos/CI no se adoptan como propios |
| E2E local completo de Edukana | No ejecutado; sin DB/app/navegador preparados. Reproducción del validador no lo sustituye |
| Preview limpio con DB y Supabase | No ejecutado; no hay autorización de reset ni identidad de recursos verificada para esta revisión; además B1 impide completar el runner fijo |
| Revocación real y ventana efectiva de URL Supabase | No ejecutadas; se inspeccionó llamada con TTL 300 y se ejercitó solo token local |
| Integración de dos instituciones, carreras DB y acciones con IDs ajenos | No ejecutada; se verificaron helpers/strings, no SQL ni HTTP real |
| Historia de tareas/notas/preguntas con transacciones | Solo inspección; no se mutó base ni se simuló una DB como si fuera evidencia real |
| UX renderizada a 360 px, teclado, 44 px y tiempos de persona nueva | No ejecutada; no hay capturas ni mediciones en este informe |
| Revisión o pruebas contra producción | Fuera de alcance y no ejecutadas |

## Contexto remoto posterior, separado del objeto auditado

Última comprobación de referencias y coordinación: **2026-10-08, aproximadamente 07:19 UTC**.

| Referencia | Estado observado | Uso en esta revisión |
|---|---|---|
| `codex/s0-independent-review` | `0e67a916b03083b22d4142f0a56b5635ba145c52` antes del commit local del informe | Base autorizada; claim ya existente verificado, no duplicado |
| `fix/role-access-hardening` | `1191b82ba20c324d60c9f8fcdc29eaa5a337ffc4` | [TEAM posterior](https://github.com/cank3r/edukana/blob/1191b82ba20c324d60c9f8fcdc29eaa5a337ffc4/TEAM-COORDINATION.md) conserva S0-GOV REVIEW y menciona CI/Vercel y soporte de Deployment Protection |
| PLAN de esa rama | S0-12 BLOCKED por reset autorizado y configuración del secreto de automatización | [Contexto posterior](https://github.com/cank3r/edukana/blob/1191b82ba20c324d60c9f8fcdc29eaa5a337ffc4/.kiro/PLAN.md); no se leyó valor alguno de ese secreto |
| `claude/s1-sec-proposal` | `0bb74bba23353757ff020761d02cebe3b61df059` | [TEAM de propuesta](https://github.com/cank3r/edukana/blob/0bb74bba23353757ff020761d02cebe3b61df059/TEAM-COORDINATION.md) incluye S1-SEC-PROPOSAL REVIEW, solo propuestas/fila; [PR #5](https://github.com/cank3r/edukana/pull/5) es draft y depende de S0 DONE |

Se leyeron los comentarios actuales de PR #2 y #5. Claude emitió una revisión sobre 0e67a91 y otra hasta 1191b82, incluyendo una observación de cabeceras de bypass. **Son opiniones/evidencias de otro revisor sobre bases diferentes**, no hallazgos propios ni autorizaciones. No se traslada el problema posterior de cabeceras al SHA auditado: su `playwright.pilot.config.mjs` no contiene esas cabeceras. Tampoco se declara que los cambios posteriores hayan corregido los hallazgos de este informe.

No se escribieron comentarios, review formal, fila de claim, ni PR nuevo. El coordinador actualizará el comentario existente con este handoff.

## Condiciones de salida de S0 y handoff

1. **Kiro corrige B1** en su claim y aporta ejecución del recorrido completo en una revisión posterior identificada. Este informe permanece anclado a 0e67a916.
2. **Conciliar documentación S0:** orden de sprints, los tres ejes de ClassSession, estado Git histórico, alcance real de rechazo de producción y URLs ya emitidas, y significado de REVIEW/handoff. Corresponde a I1–I4, I6 e I8; no requiere migraciones.
3. **Resolver S0-12/Q1 de forma explícita:** el cierre escrito exige Preview limpio, persistencia real y separación de recursos. Cualquier reset/configuración de acceso sigue necesitando la autorización específica del coordinador/Carlos; no existe en esta tarea. Si se difiere, registrar el cambio de salida/dependencia.
4. **Evidencia vinculada al SHA que se cierre:** puerta oficial Node 22, comandos/resultados, E2E y límites; no reutilizar el PASS de una base distinta. Las pruebas de fuente mantienen su nombre y alcance.
5. **S1 hereda deudas sin reabrir alcance S0:** bootstrap, allowlist, sesión viva, TTL/revocación, historia académica e integración PostgreSQL. Las nuevas specs deben estar READY y el escritor del contrato confirmado antes de tocarlo.
6. **Simplicidad:** declarar las excepciones legacy y vincular su aceptación a pruebas reales por pantalla. No declarar las pantallas ya conformes solo porque se adoptó el steering.
7. **S0-10/S0-11:** Carlos/coordinación resuelven o registran explícitamente privacidad del repositorio e infraestructura; aquí no se cambió ninguna de esas decisiones.
8. **Alcance del handoff:** solo este informe. Sin cambios de código, schema, migraciones, contratos, PLAN, steering ni archivos reclamados por otros. Al cierre local previo a la publicación de este informe no se había realizado push, merge, despliegue ni actualización del claim. El commit local y su hash se entregan en la respuesta final. El primer intento de commit se detuvo por identidad Git ausente; se usó autoría explícita `Codex <codex@review.invalid>` solo para el comando, sin modificar configuración global ni atribuir el trabajo a otra persona. La coordinación remota y el registro final de la entrega en el claim quedan al coordinador.

### Referencias al SHA auditado

Todos los enlaces de evidencia del cuerpo, salvo el apartado remoto y la API externa identificada, apuntan al SHA fijo.

[state-current]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/current-state.md#L13-L25
[state-class]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/current-state.md#L29-L34
[state-security]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/current-state.md#L42-L46
[plan-s0]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/PLAN.md#L19-L54
[plan-sprints]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/PLAN.md#L38-L54
[simplicity]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/simplicity.md#L7-L35
[model-class]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.kiro/steering/data-model.md#L50-L58
[runner-regex]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/e2e/canonical-pilot.spec.mjs#L94-L156
[runner-config]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/scripts/canonical-pilot-config.mjs#L19-L70
[runner-test]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/canonical-pilot-runner.test.mjs#L24-L40
[runner-final]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/e2e/canonical-pilot.spec.mjs#L212-L256
[playwright-config]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/playwright.pilot.config.mjs#L16-L23
[pilot-runner]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/canonical-mvp-pilot.md#L82-L101
[pilot-negatives]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/canonical-mvp-pilot.md#L58-L101
[manual-next]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1291-L1306
[manual-state]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L19-L34
[manual-evidence]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1091-L1133
[manual-setup]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1249-L1251
[manual-done]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/as-built-system-manual.md#L1334-L1368
[blueprint-mode]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/detailed-functional-blueprint.md#L261-L303
[blueprint-order]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/detailed-functional-blueprint.md#L925-L959
[catalog-mode]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/screen-action-catalog.md#L798-L807
[catalog-next]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/screen-action-catalog.md#L1091-L1104
[catalog-revoke]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/screen-action-catalog.md#L335-L342
[roadmap]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/platform-capability-roadmap.md#L68-L99
[setup-action]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/setup/actions.ts#L18-L56
[setup-page]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/setup/page.tsx#L7-L17
[schedule]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L624-L642
[asset-route]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/api/assets/%5BassetId%5D/route.ts#L9-L35
[storage-url]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/storage.ts#L88-L97
[local-route]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/api/local-storage/route.ts#L23-L65
[local-token]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/local-storage.ts#L14-L27
[guardian-read]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/guardian-portal.ts#L34-L47
[announcement-read]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/lib/announcement-data.ts#L30-L39
[academic-history]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/dashboard/academico/actions.ts#L180-L207
[exam-history]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/app/dashboard/academico/actions.ts#L236-L268
[grade-model]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L437-L454
[submission-model]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L488-L533
[exam-model]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/prisma/schema.prisma#L566-L620
[handoff-claim]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/docs/claude-s0-handoff.md#L31-L38
[team-protocol]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/TEAM-COORDINATION.md#L38-L68
[team-contracts]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/TEAM-COORDINATION.md#L90-L100
[academic-ui]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/src/components/dashboard/AcademicForms.tsx#L13-L113
[ux-tests]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/tests/ux.test.ts#L33-L88
[ci]: https://github.com/cank3r/edukana/blob/0e67a916b03083b22d4142f0a56b5635ba145c52/.circleci/config.yml#L5-L30
