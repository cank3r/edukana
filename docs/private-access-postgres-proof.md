# Private access: PostgreSQL regression evidence

Base: `3e14ff986554fb388456575ce71a5aba8d919722` (PR123 integrated).
Branch: `mvp/pg-private-access-20261013`; coordination claim `MVP-PRIVATE-ACCESS-PG`, published in `33156f9`.
This change adds coverage only. No new application defect was confirmed, and no application,
schema, migration, authentication or Storage implementation was changed.

## What is exercised

The existing `canonical-parent-announcements.test.ts` and `canonical-legacy-assets.test.ts`
remain useful DB-free regressions. These additional `.proof.ts` suites use Prisma 5.22,
PostgreSQL 16.4, production readers/handlers/policies and the supported local private Storage provider.
Only the authentication session boundary is replaced; `server-only` is disabled for the Node test harness.
Requests are Web `Request` objects passed to actual handlers, not an HTTP server or browser login.

| Suite | Cases | New evidence |
|---|---:|---|
| Tutor | 5 | Persisted withdrawal/restoration of both child capabilities with stale caller capabilities; institution/role isolation; two children with ACTIVE/COMPLETED enrollment; selective link flags/status; suspension/restoration; repeated audience queries, authorization and exact local bytes. |
| Legacy files | 11 | POST/PUT/PATCH/GET/DELETE control and repeats; valid but forbidden submission/foreign/teacher requests; size mismatch cleanup; persisted teacher overrides and reassignment; actual JSONB history produced by resubmission; concurrent PATCH/PATCH and DELETE/DELETE; winning announcement/submission fixture associations. |

Negative cases begin with valid positive fixtures and check metadata/bytes remain intact when access
is denied. The legacy historical test uses two old-format attachments, resubmits through the real
`submitAssignmentWithFiles`, then verifies JSONB references retain the detached files. An unrelated
course file remains deletable, avoiding a blanket-denial false positive.

Concurrent requests wait on a real row lock. `pg_blocking_pids` establishes the order and distinct
PostgreSQL backends before the holder releases; polling delays are not evidence of ordering.
Repeated PATCH yields 200/409 and subsequent 404; repeated DELETE yields 204/409 and subsequent 404.
The association cases update a fixture transaction directly: they prove conditional DELETE after a
winning association, not the announcement publication UI/action or universal transaction atomicity.

## Isolation and cleanup

- The fixture requires `EDUKANA_PRIVATE_ACCESS_PROOF=ISOLATED_POSTGRES_ONLY`, two identical exact
  synthetic loopback URLs, database `edukana_private_access_proof`, user `fixture`, port 5432,
  `connection_limit=8`, and `APP_URL=http://127.0.0.1:3179`.
- It checks actual database name/user/server address/port before creating fixtures. Assertions on
  supplied connection strings compare booleans so rejected values are never printed.
- Any inherited Supabase URL/service key or local Storage root/secret is rejected, including empty
  values. Each suite creates its own temporary Storage directory and synthetic signing secret.
- Fixtures belong to two fresh UUID-namespaced institutions. Cleanup targets only those IDs and a
  validated temporary directory. No shared seeds, remote DB, `.env` loading or external Storage is used.
- Local execution used new Docker containers with no published ports. PostgreSQL had `--network none`;
  the test container shared only its network namespace. Dependencies lived in a separate disposable volume.
  The checkout was read-only; a copy of versioned code plus the four new test files ran inside the container.
- All 16 existing migrations were applied only to the newly created empty database. None were authored or modified.

## Verified local results (2026-10-13)

- Node 22.20.0 / PostgreSQL 16.4 / Prisma 5.22.0: **16 passed, 0 failed, 0 skipped** (about 1.93 seconds).
- Complete TypeScript check with incremental output disabled, ESLint for all four new test files,
  workflow YAML parsing and Bash syntax: PASS.
- Negative control in another disposable container: replace only the three PR123 handler/reader files
  with their `8115614be8f0870826deda18b1fe3d9a86b6e40e` versions. Two selected new tests fail as intended:
  legacy PATCH accepts a revoked teacher (200 instead of 403), and a tutor retains two notices after
  `child.portal.view` withdrawal (expected empty audience). These are behavior failures, not import errors.
  The checkout and new assertions remained unchanged.
- After successful suites and the negative control, database counts were zero institutions,
  zero assets and zero submission revisions: both successful and failing runs cleaned their own fixtures.
- Independent review found no blocking issue. Its separate in-memory guard probe passed 17 rejection
  cases before DB/FS access and one positive boundary case. That probe is not counted as PostgreSQL evidence.

## Reproduction and CI

`.github/workflows/private-access-proof.yml` runs these suites explicitly on relevant pull requests
and supports manual dispatch. Its path filter includes the readers, policies, provider, schema/migrations,
dependencies and test helpers. This explicit discovery matters: the general integration glob finds
`*.test.ts`, not `*.proof.ts`.

Inside the dedicated disposable environment with the exact synthetic configuration above:

```sh
node --require ./tests/integration/stub-server-only.cjs --import tsx --test \
  --test-concurrency=1 --test-reporter=spec \
  tests/integration/private-access-parent.proof.ts tests/integration/private-access-legacy.proof.ts
```

Do not point this harness at Preview or a shared database. The workflow creates its own PostgreSQL
service and passes only synthetic configuration to its test container. It publishes no mailbox,
session, signed URL, private file or environment artifact.

## Remaining acceptance

These results do not validate Supabase, deployed HTTP/login, CDN behavior, token expiry, or revocation
in the middle of an already-authorized request. They demonstrate subsequent requests after committed
policy/link changes and the explicitly observed local races. Provider deletion failures may still leave
an orphan object; successful local deletion does not prove remote physical deletion.

The next code acceptance step is review of this draft and the dedicated CI result by SHA. No new merge
or deployment is authorized. Preview role/Storage acceptance remains a separate pending task using an
authorized working browser/session; this coverage does not close that gate.
