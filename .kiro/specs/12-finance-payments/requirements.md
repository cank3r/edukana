# 12 · Finanzas y pagos — Requisitos

### Requisito 1 — Planes de pago y cargos
1. `FINANCE` SHALL definir planes (inscripción, mensualidades, materiales, por crédito en UNIVERSITY, por cuotas en INSTITUTE) y asignarlos por grado, programa o estudiante.
2. Al asignar SHALL generarse los cargos del período con sus vencimientos.
3. Cargos sueltos, descuentos (hermanos, beca, pronto pago) y anulación con motivo.
4. Un job diario SHALL marcar vencidos y aplicar recargo según parámetros y días de gracia.

### Requisito 2 — Pagos
1. Registro manual (efectivo, transferencia, cheque, tarjeta en caja) con aplicación a uno o varios cargos y pagos parciales.
2. Cada pago SHALL emitir recibo PDF numerado con la marca; el comprobante fiscal se emite a través de la interfaz `FiscalProvider`.
3. Anulación y reembolso con permiso, motivo y auditoría; nunca borrado.
4. Cierre de caja por usuario y día.

### Requisito 3 — Pago en línea
1. Pasarelas soportadas detrás de `PaymentGateway`: Azul y CardNET, con credenciales cifradas **por espacio**.
2. El pago SHALL hacerse en página alojada por la pasarela; Edukana no almacena datos de tarjeta.
3. La confirmación SHALL verificarse por firma y ser idempotente por referencia.
4. Estudiante y tutor responsable SHALL pagar desde su estado de cuenta.
5. Conciliación diaria contra el reporte de la pasarela con lista de diferencias.

### Requisito 4 — Estado de cuenta y restricciones
1. Estado de cuenta por estudiante con línea de tiempo, saldo por moneda y descarga.
2. `finance.blockAccessOnDebt` SHALL aplicar la restricción elegida con mensaje claro al afectado.
3. Recordatorios automáticos según `finance.reminderSchedule`.

### Requisito 5 — Reportes
1. Cobrado, por cobrar, vencido, antigüedad de saldos, por período, grado y moneda; exportables; nunca se suman monedas distintas.

### Requisito 6 — Separación de datos
1. Los roles académicos SHALL NOT recibir datos financieros por ninguna ruta; `FINANCE` SHALL NOT recibir notas.
