// The CI integration glob also runs these DB-free page and action boundary regressions.
// Each suite stubs only session, capabilities, database and cache; none connects to PostgreSQL.
import "../assignment-action-boundaries.test";
import "../course-home-navigation.test.mjs";
import "../exam-list-navigation.test.mjs";
