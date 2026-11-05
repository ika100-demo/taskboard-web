import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type StubMode = "normal" | "503" | "500" | "bad-body" | "hang";
export type StubTask = { id: string; title: string; due_date: string | null };

/** In-process stand-in for task-api (contract in the system context of spec 001). */
export class StubTaskApi {
  mode: StubMode = "normal";
  tasks: StubTask[] = [];
  postCount = 0;
  lastPostBody: unknown = undefined;
  private server?: Server;

  start(port = 8080): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    return new Promise((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(port, resolve);
    });
  }

  stop(): Promise<void> {
    this.server?.closeAllConnections();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  reset(): void {
    this.mode = "normal";
    this.tasks = [];
    this.postCount = 0;
    this.lastPostBody = undefined;
  }

  add(title: string, due_date: string | null = null): StubTask {
    const task = { id: randomUUID(), title, due_date };
    this.tasks.push(task);
    return task;
  }

  private send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const isPost = req.method === "POST" && req.url === "/tasks";
    const isGet = req.method === "GET" && req.url === "/tasks";
    if (!isPost && !isGet) return this.send(res, 404, { detail: "Not Found" });
    if (isPost) this.postCount += 1;
    if (this.mode === "hang") return; // never answers
    if (this.mode === "503") return this.send(res, 503, { detail: "The task store is unavailable." });
    if (this.mode === "500") return this.send(res, 500, { detail: "Internal Server Error" });
    if (this.mode === "bad-body") return this.send(res, isPost ? 201 : 200, '{"unexpected": true}');
    if (isGet) return this.send(res, 200, this.tasks);

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return this.send(res, 422, { detail: [{ loc: ["body"], msg: "JSON decode error", type: "json_invalid" }] });
    }
    this.lastPostBody = body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return this.send(res, 422, { detail: [{ loc: ["body"], msg: "Input should be an object", type: "model_attributes_type" }] });
    }
    const { title, due_date } = body as { title?: unknown; due_date?: unknown };
    if (typeof title !== "string" || title.trim() === "" || [...title].length > 200) {
      return this.send(res, 422, { detail: [{ loc: ["body", "title"], msg: "Invalid title", type: "value_error" }] });
    }
    if (due_date != null && (typeof due_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(due_date))) {
      return this.send(res, 422, { detail: [{ loc: ["body", "due_date"], msg: "Invalid date", type: "value_error" }] });
    }
    return this.send(res, 201, this.add(title, (due_date as string | null | undefined) ?? null));
  }
}
