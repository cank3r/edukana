# Assignment submission preview

The student prepares a response and reviews it once before sending. The existing Server Action persists it; the finished screen says **Tarea entregada** and stays finished after a full reload. Its primary action, **Volver a mis tareas**, opens the actual course assignment list. **Editar entrega** is secondary and appears only when existing rules allow changes. Otherwise **Revisar entrega** focuses the saved response without reopening the form.

Editing is explicit: the prior submission remains saved until **Actualizar entrega** succeeds. Cancelling returns to the saved response. Uploads and completed discards retain their bookkeeping across cancel/reopen. Pending requests block editing and repeated submission; rejected responses keep the draft and show the server message. A lost response offers a separate check of the stored work before retrying.

## Confirmed cause

The previous implementation stored its success screen only in client state, always initialized preparation on mount, and made **Ver mi entrega** reload that same task. With the previous production build, a real authenticated browser POST wrote a `SUBMITTED` row in local PostgreSQL and displayed success. Clicking that blue link returned to preparation with the saved response. The regression reproduced this before the fix, including screenshots and a database receipt. No loss of persistence was observed in that reproduction.

The former review and confirmation screens also duplicated the same summary. They are now one confirmation. The fix uses the existing server-provided submission on initial render; it changes no backend contract.

## Scope

Branch `todo/m3-assignment-flow-preview-20261017`, PR #129, based on `todo/tanda-4` at `21b6b71ab166d7bfbad23d9c43a829f7afc17354`. Changes are limited to the student page/form presentation, private helpers, focused tests and their workflow. FileList, teacher presentation, authorization, Server Actions, upload services, schema and migrations are unchanged. This correction changes no deployment secrets or permissions. Merge and production remain outside the authorization.

## Real server regression

`tests/e2e/assignment-flow-real/submission.spec.ts` uses the real login, session, Next Server Action, RSC refresh, upload endpoint and PostgreSQL. It refuses any database except `127.0.0.1/edukana_assignment_test`. Each test creates synthetic users, an institution, a course and an assignment; no real student's task is used.

Six cases run at 360 and 1280 pixels:

- Success: actual POST, exact saved content, `SUBMITTED`, zero revisions, finished state after reload and revisit, correct primary/secondary actions.
- Real server rejection: invalid link, preserved text/link/uploaded PDF, no submission, explicit correction and successful attachment association.
- Duplicate prevention: hold the real assignment row lock while clicking/submitting repeatedly; exactly one POST and no extra revision.
- Explicit edit/cancel/update: cancellation writes nothing, update retains the submission ID and archives exactly one prior response.
- Saved link: existing rules close editing, review stays read-only, primary action opens the list.
- Cancel/reopen with attachments: retain a completed upload and never resurrect a discarded file.

On Windows, use Node 22, PostgreSQL 17 binaries and installed Chrome. The runner creates a new database directory, binds both services to loopback, applies existing migrations, builds Next and stops both services in `finally`. It passes only system path variables and synthetic test settings; it refuses dotenv-bearing checkouts. Set `ASSIGNMENT_FLOW_NODE`, `ASSIGNMENT_FLOW_PG_BIN` and a **new** `ASSIGNMENT_FLOW_OUTPUT` directory, then run:

```sh
python scripts/test-assignment-flow-real.py
```

`--skip-build` is only for rerunning an unchanged existing build. Evidence includes screenshots, Playwright JSON/traces, database assertions and logs. The CI workflow supplies its own disposable PostgreSQL 17 service and builds the same commit before running the real cases.

## Additional checks and limitations

```sh
node --import tsx --test tests/assignment-guide-action-contract.test.ts tests/assignment-guide-page.test.ts tests/platform-mvp-closure.test.ts
npx playwright test --config playwright.assignment-guide.config.ts
npx playwright test --config playwright.mvp-closure.config.ts
```

The isolated component matrix uses actual page/component code and CSS at 320/360/390/768/1280 pixels and 100/200% root text sizes. It covers keyboard navigation, contrast, upload/removal failures, permissions, stale props and draft retention. Its service substitutes are complementary to the real tests, not evidence of persistence. Shared MVP tests and the student's existing smoke step follow the single-confirmation flow.

Local browser evidence establishes behavior in Chromium/Chrome with synthetic data. It does not establish Safari/Firefox behavior or submission through the protected deployed Preview. CI and Preview status must refer to the final commit. No real assignment or test email is sent, and nothing is merged or deployed to production.
