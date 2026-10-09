// The CI integration command discovers these behavioral action/render tests too.
// They stub request/database boundaries and never connect to PostgreSQL.
import "../legacy-assignment-actions.test";
import "../legacy-assignment-course.test";
