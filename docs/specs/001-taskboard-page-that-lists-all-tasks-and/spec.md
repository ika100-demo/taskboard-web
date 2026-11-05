---
spec_id: 001-taskboard-page-that-lists-all-tasks-and
title: Taskboard page that lists all tasks and adds a task through task-api
status: done
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard-gitops:002-tasks-in-postgres-and-a-web-ui
---

# 001 — Taskboard page that lists all tasks and adds a task through task-api

## Problem

Spec 001 gave the taskboard a task API that can create and list tasks, but the tasks live only in the task API's memory: every restart or redeploy throws away the whole board (AC-001.9), and the API has to run as a single instance (AC-001.12). The only way to use the board is to send raw HTTP requests, so nobody who is not a developer can use it. This feature keeps tasks in a Postgres database so they survive restarts and redeploys, and adds a web UI where people can see the board and add tasks to it. The task API contract from spec 001 (paths, fields, validation, `422` errors, oldest-first bare array) stays as it is. Only the in-memory consequences change. This spec supersedes AC-001.9 and the single-instance constraint of AC-001.12 and of spec 001's non-goals.

## System context

Slice of the system plan `002-tasks-in-postgres-and-a-web-ui` in `ika100-demo/taskboard-gitops` for `taskboard-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-002.7** Given tasks A, B and C were created in that order (through the API or the web UI), when a user opens the web app's root URL, then the page lists exactly A, B and C, oldest first, each showing its title and its due date in `YYYY-MM-DD` form, and a task without a due date shows "No due date".
- **AC-002.8** Given no task exists, when a user opens the web app's root URL, then the page shows the message "No tasks yet." and the form to add a task.
- **AC-002.9** Given the web app's root URL is open, when the user enters the title "Buy milk", picks the due date 2026-12-31 and submits the form, then "Buy milk" with "2026-12-31" appears at the end of the list without the user reloading the page, the form is emptied, and `GET /tasks` on the task API includes that task.
- **AC-002.10** Given the web app's root URL is open, when the user submits the form with a title but no due date, then the task appears at the end of the list with "No due date" and `GET /tasks` returns it with `"due_date": null`.
- **AC-002.11** Given the web app's root URL is open, when the user submits the form with an empty or whitespace-only title, then the message "Enter a title." is shown at the title field, no task is created (the list on the page and `GET /tasks` are unchanged), and the entered due date is kept.
- **AC-002.12** Given the web app's root URL is open, when the user submits a title longer than 200 characters, then the message "The title can have at most 200 characters." is shown at the title field, no task is created and the entered text is kept; a title of exactly 200 characters is accepted.
- **AC-002.13** Given a task with the title `<b>bold</b> & <script>alert(1)</script>` exists, when a user opens the web app's root URL, then the title is shown literally as those characters, nothing in it is rendered as markup and no script runs.
- **AC-002.14** Given the task API cannot be reached or answers with an error, when a user opens the web app's root URL, then the page shows "Tasks could not be loaded. Try again later." instead of a list or the "No tasks yet." message; and when the user submits a valid task in that state, the page shows "The task could not be saved. Try again." and keeps the entered title and due date.
- **AC-002.15** Given the web app's root URL is open, when the user submits the title `"  Buy milk  "` (with leading and trailing spaces), then `GET /tasks` returns the task with the title exactly `"  Buy milk  "`, untrimmed, as AC-001.11 stores it.

### Contract

Two contracts: `task-api` for any HTTP caller (the web app's server among them), and the web app's own
`/api/tasks` route between its browser code and its server. The browser never calls `task-api`.

### task-api (unchanged from spec 001 except the `503`)

Base URL: in the namespace `http://task-api` (Service port 80, container 8080); in dev also through the Gateway at
`http://task-api.taskboard-dev.localhost`. All bodies are JSON (`Content-Type: application/json`, UTF-8).

Task object:

| Field | Type | Notes |
|---|---|---|
| `id` | string | non-empty, assigned by the server, unique among all tasks in the environment's database; opaque (UUID4 string) |
| `title` | string | exactly as sent, untrimmed, 1 to 200 characters (Unicode code points), not only whitespace |
| `due_date` | string or `null` | `YYYY-MM-DD` calendar date, or `null` when none was given |

No other fields are returned.

`POST /tasks`: request object with `title` (required, JSON string, not empty or only whitespace, at most 200
characters as sent) and `due_date` (optional; absent or `null` = none; else exactly `YYYY-MM-DD` and a real
calendar date, past dates accepted). Unknown fields are ignored. Responses:

- `201` with the created task object; it is durably stored when the response is sent.
- `422` for invalid input (format in "Errors"), checked before the database is touched; nothing is stored.
- `503` when the task store is unavailable; nothing is stored.

`GET /tasks`: no parameters. `200` with a bare JSON array of task objects in creation order, oldest first; `[]`
only when the database holds no task. `503` when the task store is unavailable (never `[]` in that case).

`GET /ready`: `200` `{"status": "ready"}` when a `SELECT 1` on the database succeeds; `503`
`{"status": "not ready"}` otherwise. `GET /health`: always `200` while the process runs (does not check the
database). `/metrics`, `/ping`, `/docs`, `/openapi.json` unchanged; `/openapi.json` lists the `503` on both
task operations.

### taskboard-web internal route (same origin, browser to web server)

`POST /api/tasks` on the web app, body `{"title": <string>, "due_date": <"YYYY-MM-DD" or null>}`, forwarded
unchanged to `POST {TASK_API_URL}/tasks`:

- task-api `201`: answer `201` with the task object as received.
- task-api `422`: answer `422` with task-api's body as received (the client shows the title message when an entry's
  `loc` ends in `"title"`, choosing the text by its own length/whitespace rule, and "The task could not be saved.
  Try again." for any other `422`).
- anything else, a connection error or a timeout: answer `502` `{"detail": "The task could not be saved."}`.

The page `/` itself reads `GET {TASK_API_URL}/tasks` on the server; there is no `GET /api/tasks`.

### Errors

`task-api` error formats:

- `422`: FastAPI's validation body `{"detail": [{"loc": ["body", "title"], "msg": "...", "type": "..."}]}`; the last
  `loc` element names the field (`"title"` or `"due_date"`); `["body"]` for a body that is not a JSON object. `msg`
  and `type` are informative only.
- `503`: `{"detail": "The task store is unavailable."}` (exactly this string) for `POST /tasks` and `GET /tasks`.
- `404`/`405`: FastAPI defaults `{"detail": "..."}`. `500` only for an unexpected fault unrelated to the database.

How a caller treats a response the contract does not list (any other `4xx`/`5xx`, a body that is not the expected
JSON shape, a `200` from `GET /tasks` that is not an array of task objects): the call failed. It does not assume a
task was created and does not show a partial list. For `taskboard-web`: a failed `GET /tasks` (including `503`)
renders "Tasks could not be loaded. Try again later."; a failed `POST` renders "The task could not be saved. Try
again." with the inputs kept. `POST /tasks` is not idempotent: neither the web server nor the browser retries it
automatically; after a timeout the task may or may not exist, and the user's next page load shows the truth.

Gateway or Service failures (`502`/`503`/`504` without the JSON body, connection refused) count as failures in the
same way.

### Timeouts

- `task-api` to Postgres: connect timeout 2 s, pool checkout timeout 2 s, `statement_timeout` 2 s. When the
  database is down or slow, `POST /tasks` and `GET /tasks` answer `503` within 5 s; `/ready` answers `503` within
  3 s. The pool keeps retrying connections in the background; no request blocks longer than these limits, and the
  process does not exit.
- Readiness recovery: `/ready` reflects the database on every call, so it returns to `200` at the first probe after
  the database is back (kubelet period 10 s, under the 30 s of AC-002.4).
- `taskboard-web` server to `task-api`: 6 s total per request (`AbortSignal.timeout(6000)`), above `task-api`'s own
  5 s worst case so a `503` arrives as a `503` and not as a timeout. No retry for `POST`; no retry for the page's
  `GET` either (the page renders the load-error message; the user reloads).
- Browser to `taskboard-web` `/api/tasks`: 10 s (`AbortSignal.timeout(10000)`); on timeout the save-error message
  is shown and the inputs are kept.
- When `task-api` is down, the web app keeps serving `/` (with the load-error message) and stays ready; its probes
  never call `task-api`.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- exposed through the Gateway at host `taskboard-web`
- env `TASK_API_URL=http://task-api`

### Notes for this repo

Replace the template home page (app/page.tsx and its feature cards) with the board. The browser never
calls task-api: the page is rendered on the server and the form posts to this app's own /api/tasks route
handler, which calls task-api (see Contract). Read TASK_API_URL at request time with process.env on the
server only (no NEXT_PUBLIC_ variable; the image is built once and configured per environment); default
http://localhost:8080 for `devbox run dev`. Keep /api/health and /api/ready independent of task-api.
Unit tests mock task-api with fetch mocks; Playwright e2e runs against a stub task-api server.

## Stories

As a team member, I want to open the taskboard in my browser and see every task with its due date, oldest first, so that I know what is on the board without sending HTTP requests.

As a team member, I want to add a task with a title and an optional due date from the same page, so that it lands on the shared board without a reload.

As a team member, I want clear messages when my input is invalid or the task service is unavailable, so that I know whether my task was saved and nothing I typed is lost.

## Acceptance criteria

- **AC-001.1** Given task-api returns tasks A, B and C (created in that order through the API or the web UI), when a user opens the web app's root URL, then the page lists exactly A, B and C in that order, each with its title and its `due_date` shown exactly as received (`YYYY-MM-DD`, not reformatted or shifted by time zone), a task with `"due_date": null` shows "No due date", and the list is read from task-api on every request (a task created through the API after a first load appears on the next load). (system AC-002.7)
- **AC-001.2** Given task-api returns `[]`, when a user opens the web app's root URL, then the page shows "No tasks yet." and the add form with a field labelled "Title", a date field labelled "Due date" and a button "Add task". (system AC-002.8)
- **AC-001.3** Given the root URL is open, when the user enters "Buy milk", picks 2026-12-31 and submits, then the web app sends one `POST /tasks` to task-api with `{"title": "Buy milk", "due_date": "2026-12-31"}`, and on `201` the returned task appears at the end of the list as "Buy milk" with "2026-12-31" without a page reload, and both fields are emptied. (system AC-002.9)
- **AC-001.4** Given the root URL is open, when the user submits a title with the due date left empty, then the request to task-api carries `"due_date": null` and the created task appears at the end of the list with "No due date". (system AC-002.10)
- **AC-001.5** Given the root URL is open and a due date is picked, when the user submits an empty or whitespace-only title, then "Enter a title." is shown at the title field, no request leaves the browser, the list is unchanged and the picked due date is kept. (system AC-002.11) (smoke)
- **AC-001.6** Given the root URL is open, when the user submits a title of 201 characters, then "The title can have at most 200 characters." is shown at the title field, no request leaves the browser and the entered text is kept; a title of exactly 200 characters is sent and accepted; length is counted in Unicode code points (200 emoji characters are accepted, 201 are rejected). (system AC-002.12) (smoke)
- **AC-001.7** Given the browser has passed a title to the web app, when task-api answers `422` with an entry whose `loc` ends in `"title"`, then the title message chosen by the rules of AC-001.5 and AC-001.6 ("Enter a title." for empty or whitespace-only, else "The title can have at most 200 characters.") is shown at the title field and both inputs are kept; for any other `422` the page shows "The task could not be saved. Try again." and keeps both inputs. (system AC-002.12)
- **AC-001.8** Given task-api returns a task titled `<b>bold</b> & <script>alert(1)</script>`, when a user opens the root URL (and likewise when that task was just added through the form), then the title is shown literally as those characters, no bold text or other markup is rendered and no script runs. (system AC-002.13)
- **AC-001.9** Given task-api is unreachable, times out after 6 seconds, answers `503` or any other non-`200`, or answers `200` with a body that is not an array of task objects, when a user opens the root URL, then the page shows "Tasks could not be loaded. Try again later." instead of any list entries and instead of "No tasks yet.", the add form is still shown, the web app's readiness endpoint still answers `200`, and the web app does not retry the read. (system AC-002.14)
- **AC-001.10** Given the root URL is open, when the user submits a valid task and the save fails (task-api unreachable, `503`, any status other than `201` or `422`, an unexpected body, no answer from task-api within 6 seconds, or no answer from the web app within 10 seconds), then the page shows "The task could not be saved. Try again.", keeps the entered title and due date, adds nothing to the list, and exactly one `POST /tasks` reached task-api (no automatic retry). (system AC-002.14)
- **AC-001.11** Given a browser posts `{"title": ..., "due_date": ...}` to the web app's `POST /api/tasks`, when task-api answers `201` or `422`, then the route answers with the same status and task-api's body unchanged; when task-api answers anything else, fails to connect or exceeds 6 seconds, then the route answers `502` with `{"detail": "The task could not be saved."}`. (system AC-002.14)
- **AC-001.12** Given the root URL is open, when the user submits the title `"  Buy milk  "` (leading and trailing spaces), then the request to task-api carries the title exactly `"  Buy milk  "`, untrimmed, and `GET /tasks` returns it that way. (system AC-002.15)

## Non-goals

- Editing, completing, deleting, reordering, filtering or searching tasks.
- Pagination or a limit on the number of tasks shown.
- Live updates of tasks added by other users while the page stays open (a reload shows them).
- The browser calling task-api directly; any CORS setup on task-api.
- Sign-in, users or permissions.
- Automatic retries of a failed load or save.
- Any change to task-api's contract or to the deployment wiring (provided by the system).

## Open questions

- ~~Confirm: the form's visible labels are "Title" and "Due date" and the submit button reads "Add task"?~~ Answered: yes, see AC-001.2.

## Changelog

- 2026-11-05 created
- 2026-11-05 amended: confirmed the form labels "Title" and "Due date" and the button "Add task" (AC-001.2 unchanged)
- 2026-11-05 approved
- 2026-11-05 building
- 2026-11-05 done
