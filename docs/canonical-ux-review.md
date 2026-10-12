# Evidencia UX del recorrido canónico

Base de aplicación: `ffaadff471c4c02341b31619dbef8956bf1b4896`. Claim `MVP-UX-CANONICA`, rama `mvp/canonical-ux-proof-20261012`.

## Alcance y estado

`tests/e2e/canonical-mvp/ux.spec.ts` añade diez casos: cuatro roles por dos anchos, y dos casos de teclado en el editor de nota. La prueba depende de los seis bloques UI completos y de los helpers/fixtures del nuevo harness canónico; no funciona por sí sola sobre esta rama de documentación/prueba.

**Ejecución de navegador pendiente. No es un PASS visual ni aceptación del MVP.** El integrador debe incorporar el archivo, asignar proyecto y ejecutar antes de las negativas que revocan permisos o completan la matrícula. Carlos mantiene la aceptación final en Preview.

Validación estática local: TypeScript 5.9.3 sin errores (resolución virtual de solo lectura a los helpers/fixtures reales del integrador y dependencias existentes); ESLint con el preset TypeScript de Next 16.4.0, cero errores y avisos; sintaxis y `git diff --check` correctos. No se instaló ni copió el harness a esta rama, y estas comprobaciones no ejecutaron navegador ni base de datos.

## Qué comprueba

| Área | Comprobación |
|---|---|
| Administración | Inicio, Personas, Datos de la institución, Tutores y estudiantes, Avisos; zona horaria tras recarga. |
| Docente | Inicio, contenido, entrega, calificaciones y avisos; lección persistente. |
| Estudiante | Inicio, lección, entrega, notas y avisos; progreso, entrega calificada y comentario tras recarga. |
| Tutor | Inicio, resumen del hijo y avisos; avance, nota y asistencia tras recarga. |
| 360 × 844 y 1280 × 800 | Sin desbordamiento global; a 360 px tampoco contenido principal de ancho oculto. Controles de 44 px, contando la etiqueta visible asociada de inputs. Enlaces de texto corrido no se consideran botones; el control móvil «Volver» sí se mide. |
| Teclado móvil | Abrir Menú con Enter, alcanzar opción principal con Tab y navegar con Enter; menú cerrado al cambiar de página. |
| Modal docente | Apertura de nota mediante enlace real y teclado; foco inicial, Tab/Shift+Tab, Escape, vuelta del foco y nota 92 conservada al recargar, sin guardar. |

Cada caso autentica exclusivamente cuentas ficticias creadas por el core mediante el login normal. Después del login, el navegador bloquea cualquier POST/PUT/PATCH/DELETE y lo registra como fallo; bloquea también orígenes externos. Cerrar el contexto termina el caso. No modifica usuarios, notas, vínculos, permisos ni archivos. El login puede producir las escrituras propias de autenticación.

La prueba no guarda cookies, tokens, enlaces firmados, capturas, vídeo ni trazas. Sus fallos y medidas permanecen en el informe privado del harness. Las aserciones blandas conservan el fallo del caso y permiten continuar otras pantallas; no se usan skips ni fallos esperados para convertir discrepancias en éxito.

## Hallazgos previos que todavía necesitan ejecución

- `TeacherHome.tsx:25`: el docente sin cursos recibe la instrucción de esperar asignación, aunque tiene permiso para crear cursos. Es un problema de orientación del vacío; la fixture completa ya no reproduce ese vacío.
- `ContentEditor.tsx:176`: publicar/ocultar contenido no solicita confirmación ni muestra impacto. No se pulsa en esta prueba porque cambiaría datos de negocio.
- `calificaciones/page.tsx:224` y `GradebookTools.tsx:264`: modal declarado con `aria-modal`, solo autofocus observable en código; retención de foco/Escape requieren navegador.
- `GuardianshipManager.tsx:33/43/61` y `DashboardBreadcrumbs.tsx:29`: falta tamaño mínimo explícito; solo las medidas reales decidirán el resultado.

No cubre lector de pantalla, contraste completo, correo real, backend Supabase, red lenta ni el recorrido completo de creación a 360 px. El smoke preparado y las suites de Personas/matrícula/asistencia siguen siendo evidencia complementaria, nunca sustituyen este recorrido ni la revisión humana.
