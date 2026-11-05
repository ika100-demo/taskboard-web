---
spec_id: 001-taskboard-page-that-lists-all-tasks-and
shape: web-nextjs
spec_hash: be6ef2019172
summary: Server-rendered taskboard page listing tasks from task-api, with an add form posting through the app's own /api/tasks route
tasks:
  - id: t1
    title: Shared task shape guards and title rule
    files: [app/_lib/tasks.ts, app/_lib/title.ts]
    covers: [AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.10]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: Server-only task-api client (list, create, timeout, failure mapping)
    files: [app/_lib/task-api.ts, docs/env-vars.md]
    covers: [AC-001.1, AC-001.3, AC-001.4, AC-001.9, AC-001.10, AC-001.11, AC-001.12]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t3
    title: Client TaskBoard component (list, add form, validation, messages)
    files: [app/_components/task-board.tsx, app/globals.css]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.9, AC-001.10, AC-001.12]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t4
    title: POST /api/tasks route handler
    files: [app/api/tasks/route.ts]
    covers: [AC-001.3, AC-001.4, AC-001.10, AC-001.11, AC-001.12]
    parallel_safe: true
    depends_on: [t2]
    done: true
  - id: t5
    title: Replace the template home page with the board
    files: [app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.8, AC-001.9]
    parallel_safe: true
    depends_on: [t2, t3]
    done: true
---

# Plan — 001 Taskboard page that lists all tasks and adds a task through task-api

Levels: t1 → t2, t3 → t4, t5. Contract, module interfaces and DOM contract: [design.md](design.md). No gitops task:
the exposure and `TASK_API_URL=http://task-api` are already merged in the gitops-app.

## t1 — Shared task shape guards and title rule

**Files:** app/_lib/tasks.ts, app/_lib/title.ts
**Covers:** AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.10
**Goal:** the pure, client-safe building blocks both the server and the browser use: the `Task` type with its shape
guards, and the title validation rule with its two messages.

**Implementation notes:**
- `tasks.ts`: `Task`, `isTask`, `isTaskList` exactly as in design.md (id non-empty string, title string, due_date
  `null` or `/^\d{4}-\d{2}-\d{2}$/`; extra fields ignored; arrays and `null` are not tasks).
- `title.ts`: `TITLE_REQUIRED`, `TITLE_TOO_LONG`, `titleError(title)`; whitespace check `title.trim() === ""`, length
  `[...title].length > 200` (code points, so emoji count as one).
- No imports from React or Next.js; no `process.env`.

**Done when:** unit checks of the guards and of `titleError` (empty, spaces only, 200 and 201 chars, 200 and 201
emoji) pass; `devbox run quality` is clean.

## t2 — Server-only task-api client (list, create, timeout, failure mapping)

**Files:** app/_lib/task-api.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.3, AC-001.4, AC-001.9, AC-001.10, AC-001.11, AC-001.12
**Goal:** the single place that talks to task-api: `taskApiUrl`, `listTasks`, `createTask` with the result types of
design.md.

**Implementation notes:**
- `taskApiUrl()` reads `process.env.TASK_API_URL` at call time, default `http://localhost:8080`, strips a trailing `/`.
- Every call: one `fetch`, `cache: "no-store"`, `signal: AbortSignal.timeout(TASK_API_TIMEOUT_MS)` (6000). No retry.
- `listTasks()`: `{ok: true, tasks}` only for `200` + JSON passing `isTaskList`; everything else `{ok: false}`
  (network error, abort/timeout, any other status incl. `503`, unparseable JSON, wrong shape). Never throws.
- `createTask(rawBody)`: sends `rawBody` unchanged with `Content-Type: application/json`; `201` + `isTask` →
  `created`; `422` + parseable JSON → `invalid` with the parsed body; everything else → `failed`. Never throws.
- Log each failure once as the JSON line in design.md (`op`, `reason`, `status`); never log titles or bodies.
- `docs/env-vars.md`: add a "task-api" section with `TASK_API_URL` (default `http://localhost:8080`, server-only, read
  per request, deployed value `http://task-api` set in the gitops-app).

**Done when:** unit tests with a mocked `fetch` show the 6 s signal, `no-store`, the env read per call, the unchanged
body, and every mapping row (200 valid / 200 not an array / 200 bad element / 503 / 500 / network error / abort; 201
valid / 201 bad body / 422 / 422 non-JSON / 503 / 404 / network error / abort), each with exactly one fetch call.

## t3 — Client TaskBoard component (list, add form, validation, messages)

**Files:** app/_components/task-board.tsx, app/globals.css
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.9, AC-001.10, AC-001.12
**Goal:** the interactive part of the page: `"use client"` component `TaskBoard({ initialTasks }: { initialTasks:
Task[] | null })` (`null` = the load failed) that renders the list/empty/load-error state and the add form, following
the DOM contract and the browser submit flow in design.md.

**Implementation notes:**
- State: `tasks` (from `initialTasks ?? []`), `loadFailed` (`initialTasks === null`, never reset), `title`,
  `dueDate`, `titleMessage`, `saveError`, `pending`.
- Render titles and dates as text children only; due date shown exactly as received in `<time dateTime>`; `null` →
  "No due date". No `Date` parsing, no `dangerouslySetInnerHTML`.
- Form `aria-label="Add a task"`, `noValidate`; inputs without `maxLength`/`required`; labels "Title", "Due date";
  button "Add task", disabled while `pending`.
- Submit: steps 1–5 of design.md's browser flow; `due_date: dueDate === "" ? null : dueDate`; title sent untrimmed;
  `AbortSignal.timeout(10000)`; exactly one `fetch("/api/tasks")` per accepted submit, none on a local title error.
- On success append to the end and clear both fields; on any failure keep both fields.
- Title message: `<p id="task-title-error">` + `aria-invalid`/`aria-describedby` on the title input. Save error:
  `<p role="alert">` inside the form. Load error: `<p role="alert">` above the list.
- `globals.css`: add board, list, form and message styles using the existing tokens; remove the template's
  `.hero*`, `.card*`, `.grid`, `.steps`, `.eyebrow`, `.actions` rules if nothing else uses them (check `not-found.tsx`,
  `error.tsx` first). Layout must not scroll horizontally at 375 px width.

**Done when:** component tests rendering `<TaskBoard>` with a mocked `fetch` pass for AC-001.1–001.8, 001.10 and
001.12 (the browser side), including the double-click case sending one request.

## t4 — POST /api/tasks route handler

**Files:** app/api/tasks/route.ts
**Covers:** AC-001.3, AC-001.4, AC-001.10, AC-001.11, AC-001.12
**Goal:** the app's internal route: `export async function POST(request: Request)` and `export const dynamic =
"force-dynamic"`, mapping `createTask(await request.text())` to `201` / `422` / `502` as in design.md.

**Implementation notes:**
- Read the body as text and forward it untouched (no parse, no trim, no default for `due_date`).
- `created` → `NextResponse.json(task, {status: 201})`; `invalid` → `NextResponse.json(body, {status: 422})`;
  `failed` → `NextResponse.json({detail: "The task could not be saved."}, {status: 502})`.
- Export only `POST`.

**Done when:** route tests with a mocked `fetch` for task-api pass for AC-001.11 (201 and 422 passed through, 503 /
500 / 404 / connection error / timeout → 502 with the exact body) and show the forwarded body is byte-identical to
the incoming one (AC-001.12).

## t5 — Replace the template home page with the board

**Files:** app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.8, AC-001.9
**Goal:** `/` becomes the board: an async Server Component that calls `listTasks()` on every request and renders
`<h1>Taskboard</h1>` plus `<TaskBoard initialTasks={result.ok ? result.tasks : null} />`.

**Implementation notes:**
- `app/page.tsx`: `export const dynamic = "force-dynamic"`; `export default async function HomePage()`; no
  client-side fetch of the list, no retry.
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (only the template page used them; the
  icons' licence notice goes with them).
- `tests/page.test.tsx`: delete it (it tests the removed template page; the acceptance tests cover the new page).
- `e2e/home.spec.ts`: drop the two template-specific tests ("home page renders with its landmarks" checking the
  `taskboard-web` h1, and "the health endpoint is linked"); keep the 404 and phone-width tests. Replace the landmark
  check with one that expects the `Taskboard` h1, banner, main and contentinfo.
- Leave `app/api/ready/route.ts` and `app/api/health/route.ts` untouched (they must not call task-api, AC-001.9).

**Done when:** the page acceptance tests (unit `render(await HomePage())` with mocked `fetch`, and the Playwright
specs against the stub task-api on port 8080) pass for AC-001.1, 001.2, 001.8 and 001.9, including a second page load
reflecting a task added to the stub after the first; `devbox run ci` is green with coverage at or above 80%.
