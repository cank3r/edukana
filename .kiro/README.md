# Edukana — Paquete de especificación para Kiro

Generado sobre `feat/edukana-real-mvp` (commit `3bfa7c7`).

> **Estado: aceptado como dirección de producto y arquitectura; specs en DRAFT.**
> Antes de implementar cualquier spec se debe cumplir la puerta de `.kiro/steering/spec-governance.md`.
> Las dependencias de la tabla original todavía requieren las correcciones documentadas allí.

## Cómo instalarlo
1. Copiar la carpeta `.kiro/` a la raíz del repositorio.
2. `git add .kiro && git commit -m "docs: especificación Kiro de Edukana" && git push`.
3. En Kiro, abrir el repositorio: los archivos de `steering/` se cargan como contexto y cada carpeta de `specs/` aparece como una spec con requisitos, diseño y tareas.

## Steering (contexto permanente)
| Archivo | Contenido |
|---|---|
| `product.md` | Modelo de negocio: plataforma → espacios de marca blanca → usuarios; tipos de espacio; terminología |
| `tech.md` | Stack, reglas de arquitectura, definición de terminado, deuda a eliminar |
| `structure.md` | Estructura de carpetas y convenciones |
| `roles-permissions.md` | Roles de plataforma y por tipo de espacio, catálogo de permisos, matriz, reglas fijas |
| `tenant-configuration.md` | Todos los parámetros: operador, espacio, oferta, usuario; módulos por tipo |
| `ui-ux.md` | Sistema visual, navegación por rol, inventario de pantallas |
| `data-model.md` | Modelo de datos objetivo |
| `spec-governance.md` | Estado DRAFT, puerta de preparación, dependencias y reglas de ejecución |

## Specs y orden de ejecución
| # | Spec | Depende de | Colegio | Universidad | Instituto | Marketplace |
|---|---|---|:-:|:-:|:-:|:-:|
| 00 | foundation | — | ✔ | ✔ | ✔ | ✔ |
| 01 | platform-tenancy | 00 | ✔ | ✔ | ✔ | ✔ |
| 02 | identity-auth | 01 | ✔ | ✔ | ✔ | ✔ |
| 03 | roles-settings | 02 | ✔ | ✔ | ✔ | ✔ |
| 04 | people | 03 | ✔ | ✔ | ✔ | parcial |
| 05 | academic-structure-enrollment | 04 | ✔ | ✔ | ✔ | parcial |
| 06 | content-video | 05 | ✔ | ✔ | ✔ | ✔ |
| 07 | assessments | 06 | ✔ | ✔ | ✔ | ✔ |
| 10 | communications | 02 | ✔ | ✔ | ✔ | ✔ |
| 08 | gradebook-attendance | 07 | ✔ | ✔ | ✔ | — |
| 09 | family-portal | 08, 10 | ✔ | — | opcional | — |
| 11 | admissions | 04, 10 | ✔ | ✔ | ✔ | — |
| 12 | finance-payments | 05, 10 | ✔ | ✔ | ✔ | pasarela |
| 13 | marketplace | 06, 12 | — | opcional | opcional | ✔ |
| 14 | certificates-analytics | 08 | ✔ | ✔ | ✔ | ✔ |
| 15 | ops-privacy-quality | transversal | ✔ | ✔ | ✔ | ✔ |

**Primer hito vendible (colegio):** 00–08, 10, 09, 12.
**Primer hito vendible (marketplace):** 00–03, 06, 07, 10, pasarela de 12, 13, certificados de 14.

## Regla para Kiro
Ejecutar una spec a la vez, en orden. No iniciar una spec si la anterior tiene tareas abiertas. Ante una decisión no cubierta, aplicar los principios de `product.md` y `tech.md` y registrar la decisión en el `design.md` de la spec.
