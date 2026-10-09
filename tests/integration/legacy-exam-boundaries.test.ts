// The CI integration glob also runs these DB-free, isolated action/page boundary regressions.
// Each suite owns its fixture and VM; neither changes global Prisma nor accesses PostgreSQL.
import "../legacy-exam-actions.test.mjs";
import "../legacy-exam-navigation.test.mjs";
