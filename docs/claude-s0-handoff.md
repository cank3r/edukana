# Handoff para Claude — S0 adoptado

Copia y envía este mensaje a Claude:

---

Lee primero estos archivos del repositorio, en este orden:

1. `TEAM-COORDINATION.md`
2. `.kiro/steering/current-state.md`
3. `.kiro/steering/simplicity.md`
4. `.kiro/PLAN.md`
5. `docs/as-built-system-manual.md`
6. `docs/detailed-functional-blueprint.md`
7. `docs/screen-action-catalog.md`

Adoptamos el plan corregido con estas decisiones:

- Conservamos `Institution`/`institutionId`.
- Migraremos a identidad global + `Membership` antes de importar 1,600 cuentas.
- Separaremos `Course` y `Offering` antes de datos reales.
- `ClassSession` representará sesiones presenciales, virtuales, híbridas y asincrónicas.
- `MeetingProvider` empieza con enlaces externos; BigBlueButton se evalúa según concurrencia y presupuesto.
- Video grabado migrará a `VideoProvider` de streaming.
- Dinero será centavos enteros + moneda.
- Cobros del piloto no procesan pagos; registran estados, referencias y vías externas.
- IA entra después del núcleo operativo y toda salida requiere revisión humana.
- Código nuevo adopta `src/server` gradualmente; no habrá refactor global sin valor funcional.
- Una capacidad termina solo con E2E desplegado.

S0 está actualmente reclamado por Kiro bajo `S0-GOV`. No edites los archivos incluidos en ese claim hasta que cambie a REVIEW o recibas handoff. Puedes hacer revisión de solo lectura y comentar hallazgos en el PR/issue de S0.

Cuando vayas a escribir:

1. Comprueba `TEAM-COORDINATION.md` en remoto.
2. Añade tu claim con ID, rama, alcance y siguiente paso.
3. No edites modelos, migraciones, contratos o archivos reclamados por otro agente.
4. Actualiza tu fila con pruebas, bloqueos y handoff antes de terminar.


## Reparto de trabajo aprobado

- **Claude:** migraciones, sesión/login, integridad SQL, PostgreSQL en CI, DAL e importación masiva. Siempre en rama y claim propios.
- **Kiro:** integra el recorrido completo de cada spec: servidor, UI, E2E, Preview y correcciones.
- **Codex:** revisión independiente, pruebas adversariales, casos límite y textos simples; no toca esquema por defecto.
- **Carlos:** decide, aprueba specs, prueba como usuario y fusiona.

Precisiones nuevas aceptadas de la revisión de Codex:

- ClassSession separa forma de participación, temporalidad y tipo pedagógico.
- S1 debe proteger `/setup` con bootstrap de un solo uso y allowlist de DB/Storage para Preview.
- Debe documentarse la ventana residual de URLs firmadas después de revocar acceso.
- Preguntas usadas, reenvíos, revisiones y cambios de nota necesitan historia/versiones estables.


Tu siguiente responsabilidad sugerida es revisar S0 contra el análisis de equipo y preparar una propuesta de requirements/design para S1, sin modificar todavía la spec mientras `S0-GOV` siga activo.

---
