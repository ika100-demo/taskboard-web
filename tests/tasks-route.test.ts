import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/tasks/route";

import { controlTimeout, hangUntilAborted, jsonResponse, mockFetch } from "./support/http";

beforeEach(() => {
  process.env.TASK_API_URL = "http://task-api.test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TASK_API_URL;
});

const post = (body: string) => POST(new Request("http://x/api/tasks", { method: "POST", body }));
const SAVE_FAILED = { detail: "The task could not be saved." };

describe("POST /api/tasks", () => {
  it("AC-001.11 answers 201 with task-api's body unchanged", async () => {
    const task = { id: "n1", title: "Buy milk", due_date: "2026-12-31" };
    mockFetch(() => jsonResponse(201, task));
    const res = await post(JSON.stringify({ title: "Buy milk", due_date: "2026-12-31" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(task);
  });

  it("AC-001.11 answers 422 with task-api's body unchanged", async () => {
    const body = { detail: [{ loc: ["body", "title"], msg: "bad", type: "value_error" }] };
    mockFetch(() => jsonResponse(422, body));
    const res = await post(JSON.stringify({ title: "", due_date: null }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual(body);
  });

  it("AC-001.11 answers 502 for any other status, a connection error or a body of the wrong shape", async () => {
    for (const make of [
      () => jsonResponse(503, { detail: "The task store is unavailable." }),
      () => jsonResponse(500, {}),
      () => jsonResponse(404, {}),
      () => {
        throw new TypeError("fetch failed");
      },
    ]) {
      mockFetch(make);
      const res = await post(JSON.stringify({ title: "x", due_date: null }));
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual(SAVE_FAILED);
    }
  });

  it("AC-001.11 answers 502 when task-api exceeds 6 seconds", async () => {
    const { controller } = controlTimeout(6000);
    mockFetch((_url, init) => hangUntilAborted(init));
    const pending = post(JSON.stringify({ title: "x", due_date: null }));
    controller.abort();
    const res = await pending;
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual(SAVE_FAILED);
  });

  it("AC-001.12 passes the request text to task-api untrimmed and unparsed", async () => {
    const raw = '{"title":"  Buy milk  ","due_date":null}';
    const fetchMock = mockFetch(() => jsonResponse(201, { id: "n", title: "  Buy milk  ", due_date: null }));
    await post(raw);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(raw);
  });
});
