import { vi } from "vitest";

export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Replaces globalThis.fetch with a spy that routes every call to `handler`. */
export function mockFetch(handler: FetchHandler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function callsTo(fn: ReturnType<typeof mockFetch>, suffix: string, method?: string) {
  return fn.mock.calls.filter(
    ([input, init]) => String(input).endsWith(suffix) && (method === undefined || init?.method === method),
  );
}

/** A fetch result that never settles by itself but rejects when the request's signal aborts. */
export function hangUntilAborted(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
  });
}

/**
 * Makes `AbortSignal.timeout(ms)` return a controllable signal for the given duration; other durations behave
 * normally. Returns the controller and a list of every `ms` value requested.
 */
export function controlTimeout(ms: number) {
  const controller = new AbortController();
  const requested: number[] = [];
  const original = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((n: number) => {
    requested.push(n);
    return n === ms ? controller.signal : original(n);
  });
  return { controller, requested };
}

export const A = { id: "id-a", title: "Task A", due_date: "2026-01-02" };
export const B = { id: "id-b", title: "Task B", due_date: null };
export const C = { id: "id-c", title: "Task C", due_date: "2027-03-04" };
