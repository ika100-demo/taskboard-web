# Design — 001 Taskboard page that lists all tasks and adds a task through task-api

The system contract in `spec.md` (task-api, the `/api/tasks` route, errors, timeouts) is binding and is not repeated
here in full. This design fixes how this repo implements it and the DOM contract the acceptance tests run against.

## Decisions

- **Backend-for-frontend, no client-side reads.** `/` is an async Server Component (`export const dynamic =
  "force-dynamic"`) that reads `GET {TASK_API_URL}/tasks` on every request with `cache: "no-store"` (AC-001.1). The
  browser only ever calls this app's own `POST /api/tasks` (system contract). No Server Actions: the route handler is
  the contract the system plan names, and a plain `fetch` from the client keeps the 10 s browser timeout and the
  "exactly one POST" rule (AC-001.10) explicit and testable.
- **One server-only task-api client** (`app/_lib/task-api.ts`) owns `TASK_API_URL`, the 6 s timeout, response
  validation and the failure mapping. The page and the route handler never call `fetch` on task-api themselves.
  `TASK_API_URL` is read from `process.env` inside each call (never at module load, never `NEXT_PUBLIC_`), default
  `http://localhost:8080`; a trailing `/` is stripped before `/tasks` is appended.
- **Shape validation is shared** (`app/_lib/tasks.ts`): the same `isTask` / `isTaskList` guards run on the server (page
  read, route 201 body) and in the browser (route response), so "a body that is not the expected shape" is a failure
  everywhere (AC-001.9, AC-001.10).
- **Title rule is shared and code-point based** (`app/_lib/title.ts`): length is `[...title].length` (Unicode code
  points, so 200 emoji pass and 201 fail, AC-001.6); "empty or whitespace-only" is `title.trim() === ""`. The title is
  never trimmed for sending (AC-001.12). The `<input>` must **not** carry `maxLength` or `required` (maxLength counts
  UTF-16 units and would block 200 emoji; native validation would pre-empt the spec's messages); the form is
  `noValidate`.
- **No retries anywhere.** One `fetch` per page load, one per route call, one per submit. The submit button is
  disabled while a save is in flight so a double click cannot send a second POST (AC-001.10).
- **Escaping by React only.** Titles are rendered as text children; `dangerouslySetInnerHTML` is forbidden in these
  components (AC-001.8).
- **Load failure + later successful save** (not covered by a criterion): the load-error message stays, and the created
  task is shown in the list below it. The load error is still true for the rest of the board; the user sees their task
  was saved.
- No ADR: the BFF pattern and the contract are decided by the system plan; nothing here outlives this feature.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/tasks.ts` | `Task` type, `isTask`, `isTaskList` (pure, client-safe) | new |
| `app/_lib/title.ts` | `titleError(title)` and the two message constants (pure, client-safe) | new |
| `app/_lib/task-api.ts` | server-only task-api client: `taskApiUrl`, `listTasks`, `createTask` | new |
| `app/api/tasks/route.ts` | `POST /api/tasks`: forwards to `createTask`, maps the result to 201 / 422 / 502 | new |
| `app/_components/task-board.tsx` | `"use client"`: list state, add form, validation, messages | new |
| `app/page.tsx` | async Server Component: `listTasks()` → `<TaskBoard>` | changed (template replaced) |
| `app/_components/feature-card.tsx`, `app/_components/icons.tsx` | template leftovers | deleted |
| `app/globals.css` | board/form/list styles; template hero/card/grid/steps styles removed | changed |
| `app/api/ready/route.ts`, `app/api/health/route.ts` | unchanged: never call task-api (AC-001.9) | unchanged |
| `docs/env-vars.md` | documents `TASK_API_URL` | changed |

## Contract

### Module interfaces (TypeScript)

```ts
// app/_lib/tasks.ts
export type Task = { id: string; title: string; due_date: string | null };
export function isTask(v: unknown): v is Task;
//   object (not null, not array); id: non-empty string; title: string;
//   due_date: null or a string matching /^\d{4}-\d{2}-\d{2}$/. Extra fields are ignored.
export function isTaskList(v: unknown): v is Task[];   // Array.isArray(v) && v.every(isTask)

// app/_lib/title.ts
export const TITLE_REQUIRED = "Enter a title.";
export const TITLE_TOO_LONG = "The title can have at most 200 characters.";
export function titleError(title: string): string | null;
//   title.trim() === "" -> TITLE_REQUIRED; [...title].length > 200 -> TITLE_TOO_LONG; else null

// app/_lib/task-api.ts (import only from server code)
export const TASK_API_TIMEOUT_MS = 6000;
export function taskApiUrl(): string;                    // process.env.TASK_API_URL ?? "http://localhost:8080", no trailing "/"
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export function listTasks(): Promise<ListResult>;
//   one GET {taskApiUrl()}/tasks, cache "no-store", signal AbortSignal.timeout(6000);
//   ok only for status 200 with a JSON body passing isTaskList; anything else (network error,
//   timeout, non-200, invalid JSON, wrong shape) -> { ok: false }. Never throws.
export type CreateResult =
  | { kind: "created"; task: Task }       // task-api 201 and the body passes isTask
  | { kind: "invalid"; body: unknown }    // task-api 422 and the body is valid JSON
  | { kind: "failed" };                   // everything else, incl. timeout / connection error / unparseable body
export function createTask(rawBody: string): Promise<CreateResult>;
//   one POST {taskApiUrl()}/tasks, body = rawBody unchanged, Content-Type: application/json,
//   cache "no-store", signal AbortSignal.timeout(6000). Never throws, never retries.
```

Failures are logged once on the server as one JSON line on `console.error`:
`{"level":"error","msg":"task-api request failed","op":"list"|"create","reason":"timeout"|"network"|"status"|"body","status"?:<number>}`.
Titles and request bodies are not logged.

### `POST /api/tasks` (this app)

Exactly as the system contract: the request body is read as text and passed to `createTask` unchanged (no parsing,
no trimming, no defaulting).

| `createTask` result | Response |
|---|---|
| `created` | `201`, `Content-Type: application/json`, body = the task object (JSON-equal to task-api's body) |
| `invalid` | `422`, `Content-Type: application/json`, body = task-api's body (JSON-equal) |
| `failed` | `502`, `{"detail": "The task could not be saved."}` |

The route exports only `POST` (`dynamic = "force-dynamic"`); `GET /api/tasks` answers Next.js's default `405`.

### Browser submit flow (`TaskBoard`)

1. Clear both messages. `err = titleError(title)`; if set, show it at the title field and stop: no request (AC-001.5,
   AC-001.6).
2. `fetch("/api/tasks", { method: "POST", headers: {"Content-Type": "application/json"}, body:
   JSON.stringify({ title, due_date: dueDate === "" ? null : dueDate }), signal: AbortSignal.timeout(10000) })`
   with `title` untrimmed (AC-001.3, AC-001.4, AC-001.12).
3. `201` and `isTask(body)` → append the task to the end of the list, empty both fields (AC-001.3).
4. `422` whose `detail` is an array with an entry whose `loc` is an array ending in `"title"` → show
   `titleError(title) ?? TITLE_TOO_LONG` at the title field, keep both inputs (AC-001.7).
5. Anything else (other `422`, `502`, other status, bad body, network error, timeout) → show the save error, keep both
   inputs, add nothing (AC-001.7, AC-001.10).

### DOM contract (what the acceptance tests select on)

`app/page.tsx` renders inside the layout's `<main>`:

- `<h1>Taskboard</h1>` (the only level-1 heading; the smoke test needs one).
- The load result, exactly one of:
  - tasks: `<ul aria-label="Tasks">` with one `<li>` per task in received order; each `<li>` contains the title as
    plain text and either the `due_date` string exactly as received (inside `<time dateTime="YYYY-MM-DD">`) or the text
    `No due date`. No date formatting, no `Date` parsing (AC-001.1).
  - empty (`[]`): `<p>No tasks yet.</p>` and no `<ul aria-label="Tasks">` (AC-001.2).
  - load failure: `<p role="alert">Tasks could not be loaded. Try again later.</p>`, no "No tasks yet." (AC-001.9).
    Tasks created later in this page view render in a `<ul aria-label="Tasks">` below it.
  - After the first successful add on an empty board, "No tasks yet." is replaced by the list.
- The form: `<form aria-label="Add a task" noValidate>` with
  - `<label for="task-title">Title</label>` + `<input id="task-title" name="title" type="text">`; when a title message
    is shown the input has `aria-invalid="true"` and `aria-describedby="task-title-error"`, and the message is
    `<p id="task-title-error">…</p>` directly after the input.
  - `<label for="task-due-date">Due date</label>` + `<input id="task-due-date" name="due_date" type="date">`.
  - `<button type="submit">Add task</button>`, `disabled` while a save is in flight.
  - Save error: `<p role="alert">The task could not be saved. Try again.</p>` inside the form.

So tests use `getByRole("heading", {level: 1, name: "Taskboard"})`, `getByRole("list", {name: "Tasks"})`,
`getByLabel("Title")`, `getByLabel("Due date")`, `getByRole("button", {name: "Add task"})`, `getByRole("alert")`.

### Test seams

- Unit tests (Vitest, `tests/`): mock `globalThis.fetch` (`vi.stubGlobal` / `vi.spyOn`) for task-api and for
  `/api/tasks`; set `process.env.TASK_API_URL` per test (read at call time). The page is tested as
  `render(await HomePage())`; the route as `await POST(new Request("http://x/api/tasks", {method: "POST", body}))`.
- E2E (Playwright, `e2e/`): the app's default `TASK_API_URL` is `http://localhost:8080`, so the e2e specs start an
  in-process stub task-api on port 8080 (`node:http`, in `test.beforeAll`) and need no change to
  `playwright.config.ts`. The stub lives with the acceptance tests (`e2e/support/stub-task-api.ts`, written by the
  testers) and offers: an in-memory task list with `POST`/`GET /tasks` following the task-api contract (422 body
  shape included), a mode switch (`normal` | `503` | `500` | `bad-body` | `hang`), and a counter of received
  `POST /tasks` (AC-001.10 "exactly one"). E2E specs run serially (one shared stub).

## Risks

- **Port 8080 in use** on a developer machine running the real task-api: e2e then talks to it. Accepted; the
  stub's `listen` fails loudly in that case.
- **Next.js fetch caching**: without `force-dynamic` + `no-store` the page could be statically rendered at build
  time and show a stale or failed list forever. Both are required, and the page test asserts a second load reflects a
  changed stub (AC-001.1).
- **Template tests break**: `tests/page.test.tsx` and the template assertions in `e2e/home.spec.ts` target the removed
  page; the page task replaces/removes them (they are not acceptance tests).
