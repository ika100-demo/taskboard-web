"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { isTask } from "@/app/_lib/tasks";
import type { Task } from "@/app/_lib/tasks";
import { TITLE_TOO_LONG, titleError } from "@/app/_lib/title";

const SAVE_ERROR = "The task could not be saved. Try again.";

export type TaskBoardProps = { initialTasks: Task[] | null };

function hasTitleLoc(detail: unknown): boolean {
  if (!Array.isArray(detail)) return false;
  return detail.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const loc = (entry as { loc?: unknown }).loc;
    return Array.isArray(loc) && loc[loc.length - 1] === "title";
  });
}

export function TaskBoard({ initialTasks }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks ?? []);
  const [loadFailed] = useState(initialTasks === null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleMessage, setTitleMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setTitleMessage(null);
    setSaveError(null);
    const err = titleError(title);
    if (err) {
      setTitleMessage(err);
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, due_date: dueDate === "" ? null : dueDate }),
        signal: AbortSignal.timeout(10000),
      });
      const body: unknown = await res.json().catch(() => undefined);
      if (res.status === 201 && isTask(body)) {
        setTasks((prev) => [...prev, body]);
        setTitle("");
        setDueDate("");
      } else if (res.status === 422 && hasTitleLoc((body as { detail?: unknown } | null | undefined)?.detail)) {
        setTitleMessage(titleError(title) ?? TITLE_TOO_LONG);
      } else {
        setSaveError(SAVE_ERROR);
      }
    } catch {
      setSaveError(SAVE_ERROR);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const showEmpty = !loadFailed && tasks.length === 0;

  return (
    <div className="board">
      {loadFailed && (
        <p role="alert" className="message message-error">
          Tasks could not be loaded. Try again later.
        </p>
      )}
      {showEmpty && <p className="board-empty">No tasks yet.</p>}
      {tasks.length > 0 && (
        <ul aria-label="Tasks" className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="task-item">
              <span className="task-title">{task.title}</span>
              <span className="task-due">
                {task.due_date === null ? "No due date" : <time dateTime={task.due_date}>{task.due_date}</time>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form aria-label="Add a task" noValidate onSubmit={onSubmit} className="task-form">
        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleMessage ? true : undefined}
            aria-describedby={titleMessage ? "task-title-error" : undefined}
          />
          {titleMessage && (
            <p id="task-title-error" className="message message-error">
              {titleMessage}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="task-due-date">Due date</label>
          <input
            id="task-due-date"
            name="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        {saveError && (
          <p role="alert" className="message message-error">
            {saveError}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Add task
        </button>
      </form>
    </div>
  );
}

export default TaskBoard;
