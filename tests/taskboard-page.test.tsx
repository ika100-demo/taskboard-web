import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as ready } from "@/app/api/ready/route";
import HomePage from "@/app/page";

import { A, B, C, callsTo, jsonResponse, mockFetch } from "./support/http";

beforeEach(() => {
  process.env.TASK_API_URL = "http://task-api.test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TASK_API_URL;
});

const LOAD_ERROR = "Tasks could not be loaded. Try again later.";

describe("HomePage: listing", () => {
  it("AC-001.1 lists A, B and C in order with their titles and due dates as received", async () => {
    mockFetch(() => jsonResponse(200, [A, B, C]));
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Taskboard" })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Task A");
    expect(items[0]).toHaveTextContent("2026-01-02");
    expect(items[1]).toHaveTextContent("Task B");
    expect(items[1]).toHaveTextContent("No due date");
    expect(items[2]).toHaveTextContent("Task C");
    expect(items[2]).toHaveTextContent("2027-03-04");
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });

  it("AC-001.1 reads task-api on every request", async () => {
    let tasks: unknown[] = [A];
    const fetchMock = mockFetch(() => jsonResponse(200, tasks));
    const first = render(await HomePage());
    expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(1);
    first.unmount();
    tasks = [A, B];
    render(await HomePage());
    expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(2);
    expect(callsTo(fetchMock, "/tasks")).toHaveLength(2);
    expect(fetchMock.mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("AC-001.2 shows 'No tasks yet.' and the add form for an empty list", async () => {
    mockFetch(() => jsonResponse(200, []));
    render(await HomePage());
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Due date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.8 shows markup in a title literally", async () => {
    const title = "<b>bold</b> & <script>alert(1)</script>";
    mockFetch(() => jsonResponse(200, [{ id: "x", title, due_date: null }]));
    const { container } = render(await HomePage());
    const item = within(screen.getByRole("list", { name: "Tasks" })).getByRole("listitem");
    expect(item).toHaveTextContent(title);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("HomePage: load failure", () => {
  const failures: Record<string, () => Response> = {
    "503": () => jsonResponse(503, { detail: "The task store is unavailable." }),
    "500": () => jsonResponse(500, {}),
    "404": () => jsonResponse(404, {}),
    "object body": () => jsonResponse(200, { tasks: [] }),
    "malformed entries": () => jsonResponse(200, [{ id: "x" }]),
    "invalid json": () => new Response("<html>", { status: 200 }),
    unreachable: () => {
      throw new TypeError("fetch failed");
    },
  };

  for (const [name, make] of Object.entries(failures)) {
    it(`AC-001.9 shows the load error, keeps the form and does not retry (${name})`, async () => {
      const fetchMock = mockFetch(make);
      render(await HomePage());
      expect(screen.getByText(LOAD_ERROR)).toBeInTheDocument();
      expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Title")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
      expect(callsTo(fetchMock, "/tasks")).toHaveLength(1);
    });
  }

  it("AC-001.9 keeps the readiness endpoint at 200 and never calls task-api", () => {
    const fetchMock = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(ready().status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
