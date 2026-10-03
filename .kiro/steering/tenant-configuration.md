---
inclusion: always
---
# Edukana — Parámetros y configuración

Todo parámetro se declara en `src/server/settings/registry.ts`:
`{ key, zodType, default: { SCHOOL, UNIVERSITY, INSTITUTE, MARKETPLACE }, level: 'platform' | 'tenant' | 'offering' | 'user', editPermission, requiresModule?, requiresPlanFeature?, label, help }`.
Resolución: usuario → oferta → espacio → valor por defecto del tipo. Cada cambio se audita con valor anterior y nuevo.

## A. Controlado por el operador (por espacio)
| Clave | Tipo | Notas |
|---|---|---|
| `type` | SCHOOL / UNIVERSITY / INSTITUTE / MARKETPLACE | Se elige al crear; cambiarlo re-aplica presets sin borrar datos |
| `status` | TRIAL / ACTIVE / PAST_DUE / SUSPENDED / CANCELLED | SUSPENDED = solo lectura; CANCELLED = exportación 30 días y borrado programado |
| `plan` | STARTER / PRO / ENTERPRISE / CUSTOM | |
| `billing.model` | por estudiante activo / tarifa fija / comisión por venta | |
| `billing.pricePerStudentCents`, `billing.flatFeeCents`, `billing.salesCommissionPct` | número | |
| `trialEndsAt`, `renewsAt` | fecha | |
| `limits.students`, `limits.staff`, `limits.storageGb`, `limits.videoMinutes`, `limits.campuses`, `limits.emailsPerMonth`, `limits.whatsappPerMonth` | número | Aviso al 80 %, bloqueo de altas al 100 % |
| `modules.*` | booleano | Ver lista abajo |
| `features.customDomain`, `features.removePoweredBy`, `features.customRoles`, `features.sso`, `features.api`, `features.customEmailSender` | booleano | Según plan |

### Módulos y valor por defecto
| Módulo | SCHOOL | UNIVERSITY | INSTITUTE | MARKETPLACE |
|---|:-:|:-:|:-:|:-:|
| `lms` contenido y aula | ✔ | ✔ | ✔ | ✔ |
| `assessments` tareas y exámenes | ✔ | ✔ | ✔ | ✔ |
| `gradebook` | ✔ | ✔ | ✔ | — |
| `reportCards` boletín / récord | ✔ | ✔ | ✔ | — |
| `attendance` | ✔ | opcional | ✔ | — |
| `schedule` horario y aulas | ✔ | ✔ | ✔ | — |
| `family` portal de tutores | ✔ | — | opcional | — |
| `behavior` conducta | ✔ | — | — | — |
| `counseling` orientación | opcional | opcional | — | — |
| `credits` créditos, prerrequisitos, inscripción | — | ✔ | — | — |
| `admissions` | ✔ | ✔ | ✔ | — |
| `finance` cuentas por cobrar | ✔ | ✔ | ✔ | — |
| `onlinePayments` | opcional | opcional | opcional | ✔ |
| `catalog` venta pública de cursos | — | opcional | opcional | ✔ |
| `reviews`, `coupons`, `instructorPayouts` | — | — | — | ✔ |
| `certificates` | opcional | ✔ | ✔ | ✔ |
| `messaging`, `forums` | ✔ | ✔ | ✔ | foros como Q&A |
| `liveClasses` | opcional | opcional | opcional | opcional |
| `analytics` | ✔ | ✔ | ✔ | ✔ |

## B. Controlado por el administrador del espacio
### General
`name`, `legalName`, `taxId` (RNC), `country`, `timezone` (def. America/Santo_Domingo), `locale` (es), `currency` (DOP), `secondaryCurrency?`, `dateFormat`, `weekStartsOn`, `contactEmail`, `phone`, `address`, `campuses[]`.

### Marca blanca
`branding.logoLight`, `logoDark`, `icon/favicon`, `primaryColor`, `accentColor`, `fontFamily` (lista cerrada), `radius` (sobrio / medio / redondeado), `loginImage`, `loginMessage`, `footerText`, `showPoweredBy`, `emailSenderName`, `emailReplyTo`, `emailHeaderLogo`, `customCss` (solo ENTERPRISE), `subdomain`, `customDomain` + estado de verificación DNS, `publicSite.enabled`, `publicSite.hero`, `publicSite.sections[]`, `socialLinks`, `legal.termsUrl`, `legal.privacyUrl`.
Validación: contraste mínimo AA entre `primaryColor` y texto; si falla, se ajusta el tono del texto automáticamente.

### Terminología
Mapa editable de las claves de `product.md`.

### Estructura académica
| Clave | SCHOOL | UNIVERSITY | INSTITUTE | MARKETPLACE |
|---|---|---|---|---|
| `academic.yearModel` | Año escolar | Año académico | Sin año | — |
| `academic.termType` | 4 períodos | 2 semestres o 3 cuatrimestres | Ciclos o cohortes | — |
| `academic.levels` | Inicial, Primaria, Secundaria | Grado, Postgrado | — | — |
| `academic.groupingMode` | Grado + sección fija | Sección por asignatura | Cohorte | — |
| `academic.selfEnrollment` | no | sí, en ventana | opcional | por compra |
| `academic.maxCreditsPerTerm` | — | 24 | — | — |
| `academic.enforcePrerequisites` | — | sí | opcional | opcional |

### Calificación
`grading.scaleType` (numérica 0–100, numérica 0–4/0–5/0–10/0–20, letras, conceptos por competencia), `grading.scaleBands[]` (etiqueta, mínimo, máximo, puntos GPA), `grading.passingGrade` (SCHOOL 70, UNIVERSITY 70, INSTITUTE 70), `grading.rounding` (ninguno / entero / 1 decimal / hacia arriba desde .5), `grading.termWeights[]`, `grading.finalFormula` (promedio de períodos / ponderado / período + examen final), `grading.recoveryEnabled` y `grading.recoveryRules` (completivo, extraordinario: peso y nota máxima), `grading.categoriesDefault[]`, `grading.dropLowestAllowed`, `grading.showClassAverageToStudents` (no), `grading.publishMode` (manual / automática al calificar), `grading.lockAfterCloseDays`, `grading.gpaScale`, `grading.honorRollThreshold`.

### Evaluación (valores por defecto de cada oferta)
`assess.latePolicy` (bloquear / permitir / penalizar % por día, tope), `assess.maxSubmissionAttempts`, `assess.allowedFileTypes`, `assess.maxFileMb`, `assess.examDefaultAttempts`, `assess.examGradingPolicy` (más alta / última / promedio), `assess.examShuffle`, `assess.examShowResults` (nunca / al enviar / al cerrar), `assess.examGraceSeconds`, `assess.requireRubricForPublishing`.

### Asistencia
`attendance.mode` (diaria por grupo / por clase), `attendance.statuses[]` (presente, ausente, tarde, justificada, + personalizados), `attendance.lateCountsAs` (0.5 ausencia…), `attendance.minPercentToPass` (SCHOOL 80, UNIVERSITY 75), `attendance.editWindowDays`, `attendance.notifyGuardianOnAbsence`, `attendance.notifyAfterNConsecutive`.

### Matrícula y finalización
`enroll.codeEnabled`, `enroll.waitlist`, `enroll.withdrawDeadlineRule`, `completion.rule` por defecto (manual / fin de período / todas las lecciones / lecciones + nota mínima), `completion.minGrade`, `completion.autoCertificate`.

### Personas y privacidad
`people.studentIdFormat` (prefijo + año + secuencia), `people.requiredFields[]`, `people.customFields[]` (texto, número, fecha, lista; visible para qué roles), `privacy.classmatesVisible` (no / solo nombre), `privacy.teacherSeesGuardianContact`, `privacy.guardianAccessUntilAge` (18), `privacy.consentTextVersion`, `privacy.dataRetentionMonths`, `privacy.studentCanEditProfile`.

### Familia
`family.maxGuardiansPerStudent`, `family.defaultPermissions` (notas, asistencia, finanzas, conducta), `family.weeklyDigest` (día y hora), `family.guardianCanJustifyAbsence`.

### Comunicación
`comm.channels` (app, correo, WhatsApp, push), `comm.emailProvider` + credenciales, `comm.whatsappProvider` + credenciales, `comm.quietHours`, `comm.templates[]` por evento, `comm.studentToStudentMessaging` (no), `comm.guardianToTeacherMessaging` (sí), `comm.announcementApprovalRequired`, `comm.reminderHoursBeforeDue` (24), `comm.digestMode`.

### Finanzas
`finance.currency`, `finance.taxEnabled`, `finance.taxPct`, `finance.receiptPrefix` y secuencia, `finance.fiscalReceipts` (NCF: tipo, secuencia, vencimiento) detrás de interfaz, `finance.lateFeeType` (fijo / %), `finance.lateFeeAmount`, `finance.graceDays`, `finance.partialPayments`, `finance.blockAccessOnDebt` (nada / ocultar notas / bloquear matrícula), `finance.debtThresholdCents`, `finance.paymentMethods[]`, `finance.gateway` (AZUL / CARDNET / ninguna) + credenciales cifradas, `finance.discountTypes[]` (hermanos, beca, pronto pago), `finance.reminderSchedule` (días antes y después).

### Marketplace
`market.requireReviewBeforePublish`, `market.defaultRevenueSharePct`, `market.refundWindowDays` (7 a 30), `market.refundMaxProgressPct`, `market.reviewsEnabled`, `market.reviewMinProgressPct`, `market.reviewModeration` (previa / posterior), `market.payoutSchedule` (mensual), `market.payoutMinimumCents`, `market.accessModel` (de por vida / meses), `market.instructorSeesEmails` (no), `market.freePreviewLessons`, `market.currencies[]`, `market.categories[]`.

### Certificados
`cert.template` (fondo, logo, firmas con nombre y cargo, texto con variables), `cert.codePrefix`, `cert.includeGrade`, `cert.includeHours`, `cert.qrEnabled`.

### Seguridad
`security.passwordMinLength` (10), `security.require2faForStaff`, `security.sessionMaxHours`, `security.allowedLoginMethods` (contraseña, Google, Microsoft), `security.allowedEmailDomains[]`, `security.ipAllowlistForStaff[]`, `security.lockoutAttempts`.

### Integraciones
Google (inicio de sesión, Classroom, Meet), Microsoft, Zoom, proveedor de video, webhooks salientes (URL, secreto, eventos), claves de API.

## C. Por oferta (el docente o coordinador)
Hereda de B y puede ajustar: categorías y pesos, política de tardanza, intentos, visibilidad de resultados, regla de finalización, foros activos, fechas de liberación de contenido.

## D. Por usuario
Idioma, zona horaria, tema claro/oscuro, canales de notificación por tipo de evento, resumen diario, foto.
