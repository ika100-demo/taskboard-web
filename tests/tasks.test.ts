import { describe, expect, it } from "vitest";

import { isTask, isTaskList } from "@/app/_lib/tasks";

describe("task shape guards", () => {
  it("AC-001.1 accepts a task with a YYYY-MM-DD or null due date and ignores extra fields", () => {
    expect(isTask({ id: "x", title: "t", due_date: "2026-12-31" })).toBe(true);
    expect(isTask({ id: "x", title: "t", due_date: null, extra: 1 })).toBe(true);
    expect(isTaskList([])).toBe(true);
  });

  it("AC-001.9 rejects anything that is not an array of task objects", () => {
    expect(isTaskList({ tasks: [] })).toBe(false);
    expect(isTaskList("[]")).toBe(false);
    expect(isTaskList(null)).toBe(false);
    expect(isTaskList([{ id: "x", title: "t", due_date: null }, 5])).toBe(false);
    expect(isTask(null)).toBe(false);
    expect(isTask([])).toBe(false);
    expect(isTask({ id: "", title: "t", due_date: null })).toBe(false);
    expect(isTask({ id: "x", title: 3, due_date: null })).toBe(false);
    expect(isTask({ id: "x", title: "t" })).toBe(false);
    expect(isTask({ id: "x", title: "t", due_date: "31.12.2026" })).toBe(false);
  });
});
