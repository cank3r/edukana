# 03 · Roles y configuración — Diseño

## Roles
`Role.permissions: String[]` validado contra el catálogo. Roles de sistema con `tenantId = null`, resueltos por tipo. Permisos efectivos = unión de roles de la membresía activa ∩ módulos activos. Caché por petición.
Ámbito: `Membership.scopeType ∈ {CAMPUS, LEVEL, PROGRAM, OFFERING}`. El DAL expone `scopeFilter(ctx, entity)` que devuelve el `where` adicional; toda lista de personal lo aplica.

## Registro de configuración
```ts
defineSetting({ key:'grading.passingGrade', schema:z.number().min(0).max(100),
  defaults:{SCHOOL:70,UNIVERSITY:70,INSTITUTE:70,MARKETPLACE:null},
  level:'tenant', permission:'tenant.settings.edit', module:'gradebook',
  section:'grading', label:'Nota mínima para aprobar', help:'…' })
```
`getSetting(ctx, key, { offeringId? })` tipado por clave. `setSetting` valida, audita e invalida caché. Las pantallas se **generan** desde el registro (componente por tipo de esquema) con posibilidad de componente a medida por sección (marca, escala, plantillas).

## Terminología
`t(ctx, 'learner', { count })` + diccionario base es/en. Regla ESLint que prohíbe literales de las claves terminológicas en JSX.

## Editor de escala de calificación
Tabla de bandas con validación de solapamiento y vista previa de conversión.

## Rutas
`/configuracion/[seccion]`, `/personas/roles`, `/personas/roles/[id]`, `/configuracion/auditoria`.

## Pruebas
Resolución en cascada; rol personalizado no rompe reglas fijas; ámbito filtra listas y detalle; sección oculta sin módulo; secreto nunca aparece en respuestas.
