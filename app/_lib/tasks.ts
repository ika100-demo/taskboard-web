export type Task = { id: string; title: string; due_date: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isTask(v: unknown): v is Task {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id === "") return false;
  if (typeof o.title !== "string") return false;
  return o.due_date === null || (typeof o.due_date === "string" && DATE_RE.test(o.due_date));
}

export function isTaskList(v: unknown): v is Task[] {
  return Array.isArray(v) && v.every(isTask);
}
