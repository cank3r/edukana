// Include the DB-free production reader/page regressions in CI's existing test discovery.
// Node runs this file in its own process; the imported suite restores its auth and Prisma stubs.
import "../portal-grades.test";
