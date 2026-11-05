import { isTask, isTaskList } from "./tasks";
import type { Task } from "./tasks";

export const TASK_API_TIMEOUT_MS = 6000;

export function taskApiUrl(): string {
  const url = process.env.TASK_API_URL ?? "http://localhost:8080";
  return url.replace(/\/$/, "");
}

export type ListResult = { ok: true; tasks: Task[] } | { ok: false };

export type CreateResult =
  | { kind: "created"; task: Task }
  | { kind: "invalid"; body: unknown }
  | { kind: "failed" };

type Reason = "timeout" | "network" | "status" | "body";

function logFailure(op: "list" | "create", reason: Reason, status?: number): void {
  const line: Record<string, unknown> = {
    level: "error",
    msg: "task-api request failed",
    op,
    reason,
  };
  if (status !== undefined) line.status = status;
  console.error(JSON.stringify(line));
}

async function request(
  op: "list" | "create",
  init: RequestInit,
): Promise<Response | null> {
  try {
    return await fetch(`${taskApiUrl()}/tasks`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(TASK_API_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    logFailure(op, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
    return null;
  }
}

async function readJson(res: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await res.json() };
  } catch {
    return { ok: false };
  }
}

export async function listTasks(): Promise<ListResult> {
  const res = await request("list", { method: "GET" });
  if (!res) return { ok: false };
  if (res.status !== 200) {
    logFailure("list", "status", res.status);
    return { ok: false };
  }
  const json = await readJson(res);
  if (!json.ok || !isTaskList(json.value)) {
    logFailure("list", "body");
    return { ok: false };
  }
  return { ok: true, tasks: json.value };
}

export async function createTask(rawBody: string): Promise<CreateResult> {
  const res = await request("create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
  if (!res) return { kind: "failed" };
  if (res.status !== 201 && res.status !== 422) {
    logFailure("create", "status", res.status);
    return { kind: "failed" };
  }
  const json = await readJson(res);
  if (!json.ok) {
    logFailure("create", "body");
    return { kind: "failed" };
  }
  if (res.status === 422) return { kind: "invalid", body: json.value };
  if (!isTask(json.value)) {
    logFailure("create", "body");
    return { kind: "failed" };
  }
  return { kind: "created", task: json.value };
}
