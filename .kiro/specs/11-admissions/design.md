# 11 · Admisiones — Diseño
**Datos:** `AdmissionForm`, `Application`, `ApplicationEvent`, `ApplicationDocument`. Acceso del aspirante por token firmado (sin cuenta).
**Conversión:** `convertApplication` reutiliza `createPerson`, `linkGuardian`, `enroll`, `assignFeePlan`.
**Rutas:** públicas `/admision`, `/admision/estado/[token]`; internas `/admisiones`, `/admisiones/[id]`, `/admisiones/formulario`.
**Pruebas:** conversión idempotente; duplicados; documentos privados; límite del plan.
