import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

import { A, callsTo, controlTimeout, hangUntilAborted, jsonResponse, mockFetch } from "./support/http";

const SAVE_ERROR = "The task could not be saved. Try again.";
const REQUIRED = "Enter a title.";
const TOO_LONG = "The title can have at most 200 characters.";

beforeEach(() => {
  process.env.TASK_API_URL = "http://task-api.test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TASK_API_URL;
});

type Save = (body: Record<string, unknown>, init?: RequestInit) => Response | Promise<Response>;

/** Page load returns `initial`; POST /api/tasks goes to `save`. */
async function openBoard(initial: unknown[], save: Save) {
  const fetchMock = mockFetch((url, init) => {
    if (url.endsWith("/api/tasks")) return save(JSON.parse(String(init?.body)), init);
    return jsonResponse(200, initial);
  });
  render(await HomePage());
  return fetchMock;
}

const posts = (fetchMock: Awaited<ReturnType<typeof openBoard>>) => callsTo(fetchMock, "/api/tasks", "POST");
const titleInput = () => screen.getByLabelText("Title") as HTMLInputElement;
const dueInput = () => screen.getByLabelText("Due date") as HTMLInputElement;
const fill = (title: string, due = "") => {
  fireEvent.change(titleInput(), { target: { value: title } });
  if (due) fireEvent.change(dueInput(), { target: { value: due } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Add task" }));
const items = () => within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
const echo: Save = (body) => jsonResponse(201, { id: "new-1", ...body });

describe("TaskBoard: adding", () => {
  it("AC-001.3 posts the task, appends it without reload and empties both fields", async () => {
    const fetchMock = await openBoard([A], echo);
    fill("Buy milk", "2026-12-31");
    submit();
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items()[1]).toHaveTextContent("Buy milk");
    expect(items()[1]).toHaveTextContent("2026-12-31");
    expect(titleInput().value).toBe("");
    expect(dueInput().value).toBe("");
    expect(posts(fetchMock)).toHaveLength(1);
    const init = posts(fetchMock)[0][1];
    expect(JSON.parse(String(init?.body))).toEqual({ title: "Buy milk", due_date: "2026-12-31" });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(callsTo(fetchMock, "/tasks")).toHaveLength(1 + 1); // the page read and the one POST
  });

  it("AC-001.3 replaces 'No tasks yet.' by the list after the first add", async () => {
    await openBoard([], echo);
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    fill("First", "2026-01-01");
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });

  it("AC-001.4 sends due_date null and shows 'No due date'", async () => {
    const fetchMock = await openBoard([A], echo);
    fill("Buy milk");
    submit();
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items()[1]).toHaveTextContent("Buy milk");
    expect(items()[1]).toHaveTextContent("No due date");
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.12 sends the title untrimmed", async () => {
    const fetchMock = await openBoard([], echo);
    fill("  Buy milk  ");
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body)).title).toBe("  Buy milk  ");
  });

  it("AC-001.8 shows a just-added markup title literally", async () => {
    const title = "<b>bold</b> & <script>alert(1)</script>";
    await openBoard([], echo);
    fill(title);
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(items()[0]).toHaveTextContent(title);
    expect(items()[0].querySelector("b")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("TaskBoard: validation", () => {
  it("AC-001.5 rejects empty and whitespace-only titles without a request, keeping the due date", async () => {
    const fetchMock = await openBoard([A], echo);
    for (const t of ["", "   "]) {
      fill(t, "2026-05-06");
      submit();
      expect(await screen.findByText(REQUIRED)).toBeInTheDocument();
      expect(titleInput()).toHaveAttribute("aria-invalid", "true");
      expect(titleInput()).toHaveAccessibleDescription(REQUIRED);
      expect(dueInput().value).toBe("2026-05-06");
      expect(items()).toHaveLength(1);
    }
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it("AC-001.6 rejects 201 characters, keeps the text, sends no request", async () => {
    const fetchMock = await openBoard([A], echo);
    const long = "a".repeat(201);
    fill(long);
    submit();
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(titleInput().value).toBe(long);
    expect(posts(fetchMock)).toHaveLength(0);
    expect(items()).toHaveLength(1);
  });

  it("AC-001.6 accepts exactly 200 characters and 200 emoji, rejects 201 emoji", async () => {
    const fetchMock = await openBoard([], echo);
    fill("a".repeat(200));
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    fill("😀".repeat(200));
    submit();
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(posts(fetchMock)).toHaveLength(2);
    fill("😀".repeat(201));
    submit();
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(posts(fetchMock)).toHaveLength(2);
  });

  it("AC-001.6 puts no maxLength or required on the title input", async () => {
    await openBoard([], echo);
    expect(titleInput()).not.toHaveAttribute("maxlength");
    expect(titleInput()).not.toBeRequired();
  });
});

describe("TaskBoard: server-side title rejection", () => {
  const titleDetail = { detail: [{ loc: ["body", "title"], msg: "bad", type: "value_error" }] };

  it("AC-001.7 shows the title message by the local rules and keeps both inputs", async () => {
    // A title that passes the local check (e.g. a server with a stricter rule): the long message is chosen.
    await openBoard([], () => jsonResponse(422, titleDetail));
    fill("Buy milk", "2026-12-31");
    submit();
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(titleInput().value).toBe("Buy milk");
    expect(dueInput().value).toBe("2026-12-31");
    expect(screen.queryByText("No tasks yet.")).toBeInTheDocument();
  });

  it("AC-001.7 shows 'The task could not be saved. Try again.' for any other 422 and keeps both inputs", async () => {
    await openBoard([], () => jsonResponse(422, { detail: [{ loc: ["body", "due_date"], msg: "bad", type: "x" }] }));
    fill("Buy milk", "2026-12-31");
    submit();
    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
    expect(titleInput().value).toBe("Buy milk");
    expect(dueInput().value).toBe("2026-12-31");
  });
});

describe("TaskBoard: save failures", () => {
  const failures: Record<string, Save> = {
    "502 from the route": () => jsonResponse(502, { detail: "The task could not be saved." }),
    "503": () => jsonResponse(503, {}),
    "200": () => jsonResponse(200, {}),
    "201 with an unexpected body": () => jsonResponse(201, { nope: true }),
    "201 with invalid json": () => new Response("<html>", { status: 201 }),
    "network error": () => {
      throw new TypeError("fetch failed");
    },
  };

  for (const [name, save] of Object.entries(failures)) {
    it(`AC-001.10 shows the save error, keeps the inputs, adds nothing, one POST (${name})`, async () => {
      const fetchMock = await openBoard([A], save);
      fill("Buy milk", "2026-12-31");
      submit();
      expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
      expect(titleInput().value).toBe("Buy milk");
      expect(dueInput().value).toBe("2026-12-31");
      expect(items()).toHaveLength(1);
      expect(posts(fetchMock)).toHaveLength(1);
    });
  }

  it("AC-001.10 gives up after 10 seconds without an answer from the web app", async () => {
    const page = controlTimeout(10000);
    const fetchMock = await openBoard([A], (_body, init) => hangUntilAborted(init));
    fill("Buy milk", "2026-12-31");
    submit();
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(page.requested).toContain(10000);
    page.controller.abort();
    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(titleInput().value).toBe("Buy milk");
    expect(dueInput().value).toBe("2026-12-31");
    expect(items()).toHaveLength(1);
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("AC-001.10 disables the button while saving so a double click sends one POST", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = await openBoard([], () => new Promise<Response>((resolve) => (release = resolve)));
    fill("Buy milk");
    submit();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled());
    submit();
    release(jsonResponse(201, { id: "n", title: "Buy milk", due_date: null }));
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("AC-001.9 keeps the load error and shows a later saved task below it", async () => {
    mockFetch((url, init) =>
      url.endsWith("/api/tasks") ? echo(JSON.parse(String(init?.body))) : jsonResponse(503, {}),
    );
    render(await HomePage());
    expect(screen.getByText("Tasks could not be loaded. Try again later.")).toBeInTheDocument();
    fill("Buy milk");
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.getByText("Tasks could not be loaded. Try again later.")).toBeInTheDocument();
  });
});
