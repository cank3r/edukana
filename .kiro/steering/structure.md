---
inclusion: always
---
# Edukana — Estructura del código

`current-state.md` define qué existe. La estructura objetivo se adopta gradualmente; no mover todo el repositorio en un refactor masivo.

## Estructura actual

```
src/
  proxy.ts                    redirecciones de autenticación
  app/
    setup/                    primera institución
    login/                    credenciales
    dashboard/                rutas actuales en español
      aula/                   cursos y detalle
      portal/                 estudiante
      hijos/                  tutor
      gestion/                personas
      configuracion/          institución, roles, tutores, unidades y setup
      comunidad/              anuncios
      calendario/             horario
      admisiones/             leads
      pagos/                  cobros
      analitica/              KPIs
      academico/actions.ts    acciones académicas legacy concentradas
    api/                      auth, assets, storage y certificados
  components/dashboard/       componentes actuales por pantalla
  lib/                        dominio, políticas, DB y utilidades actuales
prisma/                       schema y seis migraciones
tests/                        unitarias, contractuales y e2e
.kiro/                        steering, specs y PLAN
```

Las rutas actuales se conservan durante S0–S4 para no romper enlaces ni el runner.

## Estructura para código nuevo

```
src/
  server/
    context.ts                contexto vivo de petición
    authz/                    catálogo y can()
    data/<domain>/            consultas Prisma y view models
    actions/<domain>/         acciones pequeñas por agregado
    integrations/
      email/
      meetings/
      video/
      ai/
    jobs/
    audit.ts
  components/
    ui/                       primitivos compartidos
    shell/                    navegación y layout
    domain/<domain>/          componentes por dominio
  lib/                        utilidades puras sin Prisma
```

## Migración gradual

1. El código nuevo empieza en `src/server`.
2. Al modificar un dominio, mover sus consultas a `server/data`.
3. Mantener adaptadores temporales para rutas actuales.
4. Dividir páginas por pestaña dentro del sprint del dominio.
5. No combinar movimiento masivo con migraciones críticas.
6. Retirar imports directos de `db` cuando exista paridad y pruebas.

## Convenciones

- Leer y reclamar trabajo en `TEAM-COORDINATION.md`.
- Rutas visibles en español y minúsculas.
- Componentes en PascalCase.
- Una acción por archivo cuando supera 60–100 líneas o mezcla agregados.
- Archivos nuevos menores de 300 líneas salvo excepción documentada.
- Líneas menores de 140 caracteres.
- Textos y estados definidos en spec.
- View models mínimos; no pasar modelos Prisma completos.
- Integración en `tests/integration/**` y E2E en `tests/e2e/**`.
- Prettier puede añadirse separado, sin formateo global mezclado con lógica.
