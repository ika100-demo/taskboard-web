import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTask, listTasks, taskApiUrl } from "@/app/_lib/task-api";

import { A, B, controlTimeout, hangUntilAborted, jsonResponse, mockFetch } from "./support/http";

beforeEach(() => {
  process.env.TASK_API_URL = "http://task-api.test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TASK_API_URL;
});

describe("taskApiUrl", () => {
  it("AC-001.1 reads TASK_API_URL at call time, strips a trailing slash, defaults to localhost:8080", () => {
    process.env.TASK_API_URL = "http://other.test/";
    expect(taskApiUrl()).toBe("http://other.test");
    delete process.env.TASK_API_URL;
    expect(taskApiUrl()).toBe("http://localhost:8080");
  });
});

describe("listTasks", () => {
  it("AC-001.1 reads GET /tasks uncached and keeps the received order and dates", async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, [A, B]));
    const { requested } = controlTimeout(6000);
    expect(await listTasks()).toEqual({ ok: true, tasks: [A, B] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://task-api.test/tasks");
    expect(init?.cache).toBe("no-store");
    expect(requested).toContain(6000);
  });

  it("AC-001.9 fails on non-200, wrong shape, invalid JSON and network errors, with one request each", async () => {
    for (const make of [
      () => jsonResponse(503, { detail: "The task store is unavailable." }),
      () => jsonResponse(500, {}),
      () => jsonResponse(200, { tasks: [] }),
      () => jsonResponse(200, [{ id: "x" }]),
      () => new Response("not json", { status: 200 }),
    ]) {
      const fetchMock = mockFetch(make);
      expect(await listTasks()).toEqual({ ok: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
    const failing = mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await listTasks()).toEqual({ ok: false });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("AC-001.9 fails when task-api does not answer within 6 seconds", async () => {
    const { controller } = controlTimeout(6000);
    const fetchMock = mockFetch((_url, init) => hangUntilAborted(init));
    const pending = listTasks();
    controller.abort();
    expect(await pending).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createTask", () => {
  const raw = JSON.stringify({ title: "  Buy milk  ", due_date: null });

  it("AC-001.12 forwards the raw body unchanged as one POST /tasks with a 6 second limit", async () => {
    const created = { id: "n", title: "  Buy milk  ", due_date: null };
    const fetchMock = mockFetch(() => jsonResponse(201, created));
    const { requested } = controlTimeout(6000);
    expect(await createTask(raw)).toEqual({ kind: "created", task: created });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://task-api.test/tasks");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(raw);
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.cache).toBe("no-store");
    expect(requested).toContain(6000);
  });

  it("AC-001.11 maps 422 to invalid with task-api's body", async () => {
    const body = { detail: [{ loc: ["body", "title"], msg: "x", type: "y" }] };
    mockFetch(() => jsonResponse(422, body));
    expect(await createTask(raw)).toEqual({ kind: "invalid", body });
  });

  it("AC-001.10 maps everything else to failed after exactly one request", async () => {
    for (const make of [
      () => jsonResponse(503, { detail: "The task store is unavailable." }),
      () => jsonResponse(500, {}),
      () => jsonResponse(200, A),
      () => jsonResponse(201, { nope: true }),
      () => new Response("garbage", { status: 201 }),
      () => new Response("garbage", { status: 422 }),
    ]) {
      const fetchMock = mockFetch(make);
      expect(await createTask(raw)).toEqual({ kind: "failed" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("AC-001.11 maps a connection error and a 6 second timeout to failed", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await createTask(raw)).toEqual({ kind: "failed" });
    vi.unstubAllGlobals();

    const { controller } = controlTimeout(6000);
    const fetchMock = mockFetch((_url, init) => hangUntilAborted(init));
    const pending = createTask(raw);
    controller.abort();
    expect(await pending).toEqual({ kind: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
