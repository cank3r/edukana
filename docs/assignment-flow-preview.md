# Assignment submission preview

The student submission form now presents preparation, review and confirmation as three navigable views. Completed steps use a green check and explicit text; the active step is announced separately. Navigation never submits. Editing invalidates the current review, and delivery completes only after the existing action returns `ok: true`.

One mounted form retains the draft and attachment selection across navigation and rejected actions. Upload/removal locks and the synchronous submission guard remain in place. After success, navigation shows the confirmed response as read-only. An uncertain result asks the student to check the saved submission before explicitly starting another attempt.

## Scope and dependencies

This branch starts at `todo/tanda-4` commit `21b6b71ab166d7bfbad23d9c43a829f7afc17354`. It contains the student presentation changes, private form helpers, focused tests and their isolated browser workflow. It does not depend on unpublished branding or operator changes. FileList, teacher presentation, authorization, server actions, upload services, schema and migrations are unchanged.

The branch uses the existing `todo/**` Preview configuration. No Vercel configuration, credentials or permissions change. Preview approval is separate from merge or production approval.

## Reproducible tests

```sh
node --import tsx --test tests/assignment-guide-action-contract.test.ts tests/assignment-guide-page.test.ts tests/platform-mvp-closure.test.ts
node node_modules/next/dist/bin/next build --webpack
npx playwright install chromium
npx playwright test --config playwright.assignment-guide.config.ts
```

Use a checkout with history: the harness reads the public base commit for historical comparisons. Its page and form sources are byte-identical to the local baseline used during development. Set `ASSIGNMENT_GUIDE_OUTPUT` to choose the results directory. The default is a sibling directory outside the repository.

The browser matrix covers 320/360/390/768/1280 px, root font sizes of 100/200%, keyboard/tap navigation, completed states, draft retention, partial uploads, removal failure, permissions, double submission, revalidated props and success/error recovery. An independent visual review informed confirmation-button ordering and keyboard-focus evidence.

The harness renders the real page and React components with application CSS and Inter. Session, services and action results are isolated substitutes; upload requests are intercepted. It makes no academic submissions or email deliveries. Its screenshots contain synthetic examples. These tests do not establish deployed authentication, persistence or Next Server Action transport. A deployed test must use an existing authorized demo session and report those results separately.

CI and Preview results must be checked against the final branch commit. A passing local build or a deployment notification from a different PR is not evidence of that outcome.

## Local verification before publication

The clean extraction passed 28 focused tests, 188 general tests, TypeScript, targeted ESLint, a webpack build and all 98 browser cases without skips or retries. Independent review verified the four product files match the approved candidate and the unchanged FileList, teacher rendering and access boundaries. The browser runner produced 276 synthetic screenshots. These local results are distinct from the final remote CI and deployment status recorded in the PR.
