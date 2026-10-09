// DB-free direct-handler regressions discovered by the unchanged integration glob.
// Kept in their own Node test process so fixture modules never replace the real DB.
import "../legacy-exam-review.test";
