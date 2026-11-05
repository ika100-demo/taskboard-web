import { expect, test } from "@playwright/test";

import { StubTaskApi } from "./support/stub-task-api";

test.describe.configure({ mode: "serial" });
test.skip(!!process.env.SMOKE_BASE_URL, "uses the in-process stub task-api, not a deployment");

const stub = new StubTaskApi();
const LOAD_ERROR = "Tasks could not be loaded. Try again later.";
const SAVE_ERROR = "The task could not be saved. Try again.";

test.beforeAll(async () => {
  await stub.start(8080);
});
test.afterAll(async () => {
  await stub.stop();
});
test.beforeEach(() => stub.reset());

const rows = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Tasks" }).getByRole("listitem");

test("AC-001.1 lists the tasks in order with their dates and re-reads on every load", async ({ page }) => {
  stub.add("Task A", "2026-01-02");
  stub.add("Task B");
  stub.add("Task C", "2027-03-04");
  await page.goto("/");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText("Task A");
  await expect(rows(page).nth(0)).toContainText("2026-01-02");
  await expect(rows(page).nth(1)).toContainText("No due date");
  await expect(rows(page).nth(2)).toContainText("2027-03-04");
  stub.add("Task D", "2028-05-06");
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).nth(3)).toContainText("Task D");
});

test("AC-001.2 shows the empty state and the add form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No tasks yet.")).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();
  await expect(page.getByLabel("Due date")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
});

test("AC-001.3 adds a task without reload and empties the form", async ({ page }) => {
  stub.add("Existing");
  await page.goto("/");
  await page.getByLabel("Title").fill("Buy milk");
  await page.getByLabel("Due date").fill("2026-12-31");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toContainText("Buy milk");
  await expect(rows(page).nth(1)).toContainText("2026-12-31");
  await expect(page.getByLabel("Title")).toHaveValue("");
  await expect(page.getByLabel("Due date")).toHaveValue("");
  expect(stub.postCount).toBe(1);
  expect(stub.lastPostBody).toEqual({ title: "Buy milk", due_date: "2026-12-31" });
});

test("AC-001.4 adds a task without a due date", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Title").fill("Buy milk");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText("No due date");
  expect(stub.lastPostBody).toEqual({ title: "Buy milk", due_date: null });
});

test("AC-001.5 an empty title shows the message, sends nothing and keeps the due date", async ({ page }) => {
  stub.add("Existing");
  await page.goto("/");
  await page.getByLabel("Due date").fill("2026-05-06");
  await page.getByLabel("Title").fill("   ");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Enter a title.")).toBeVisible();
  await expect(page.getByLabel("Due date")).toHaveValue("2026-05-06");
  await expect(rows(page)).toHaveCount(1);
  expect(stub.postCount).toBe(0);
});

test("AC-001.6 201 characters are rejected, 200 emoji are accepted", async ({ page }) => {
  await page.goto("/");
  const long = "a".repeat(201);
  await page.getByLabel("Title").fill(long);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("The title can have at most 200 characters.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(long);
  expect(stub.postCount).toBe(0);
  await page.getByLabel("Title").fill("😀".repeat(200));
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(stub.postCount).toBe(1);
});

test("AC-001.7 a title 422 from task-api shows the title message, any other 422 the save error", async ({ page }) => {
  await page.route("**/api/tasks", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: [{ loc: ["body", "title"], msg: "x", type: "y" }] }),
    }),
  );
  await page.goto("/");
  await page.getByLabel("Title").fill("Buy milk");
  await page.getByLabel("Due date").fill("2026-12-31");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("The title can have at most 200 characters.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Buy milk");
  await expect(page.getByLabel("Due date")).toHaveValue("2026-12-31");
  await page.unroute("**/api/tasks");
  await page.route("**/api/tasks", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: [{ loc: ["body", "due_date"], msg: "x", type: "y" }] }),
    }),
  );
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(SAVE_ERROR)).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Buy milk");
});

test("AC-001.8 shows markup in a title literally, loaded and just added", async ({ page }) => {
  const title = "<b>bold</b> & <script>alert(1)</script>";
  stub.add(title);
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs += 1;
    void d.dismiss();
  });
  await page.goto("/");
  await expect(rows(page).nth(0)).toHaveText(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(1)).toContainText(title);
  await expect(page.locator("main b")).toHaveCount(0);
  expect(dialogs).toBe(0);
});

for (const mode of ["503", "500", "bad-body"] as const) {
  test(`AC-001.9 shows the load error when task-api answers ${mode}`, async ({ page, request }) => {
    stub.mode = mode;
    await page.goto("/");
    await expect(page.getByText(LOAD_ERROR)).toBeVisible();
    await expect(page.getByText("No tasks yet.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
    expect((await request.get("/api/ready")).status()).toBe(200);
  });
}

test("AC-001.9 shows the load error when task-api does not answer within 6 seconds", async ({ page, request }) => {
  test.setTimeout(30_000);
  stub.mode = "hang";
  await page.goto("/", { timeout: 20_000 });
  await expect(page.getByText(LOAD_ERROR)).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();
  expect((await request.get("/api/ready")).status()).toBe(200);
});

for (const mode of ["503", "500", "bad-body"] as const) {
  test(`AC-001.10 shows the save error and sends one POST when task-api answers ${mode}`, async ({ page }) => {
    await page.goto("/");
    stub.mode = mode;
    await page.getByLabel("Title").fill("Buy milk");
    await page.getByLabel("Due date").fill("2026-12-31");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText(SAVE_ERROR)).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Buy milk");
    await expect(page.getByLabel("Due date")).toHaveValue("2026-12-31");
    await expect(page.getByRole("list", { name: "Tasks" })).toHaveCount(0);
    expect(stub.postCount).toBe(1);
  });
}

test("AC-001.10 shows the save error when task-api does not answer within 6 seconds", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");
  stub.mode = "hang";
  await page.getByLabel("Title").fill("Buy milk");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(SAVE_ERROR)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Title")).toHaveValue("Buy milk");
  expect(stub.postCount).toBe(1);
});

test("AC-001.11 POST /api/tasks relays 201 and 422 and maps failures to 502", async ({ request }) => {
  const created = await request.post("/api/tasks", { data: { title: "Via route", due_date: "2026-02-03" } });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ title: "Via route", due_date: "2026-02-03" });

  const invalid = await request.post("/api/tasks", { data: { title: "  ", due_date: null } });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).detail[0].loc.at(-1)).toBe("title");

  stub.mode = "503";
  const failed = await request.post("/api/tasks", { data: { title: "x", due_date: null } });
  expect(failed.status()).toBe(502);
  expect(await failed.json()).toEqual({ detail: "The task could not be saved." });
});

test("AC-001.12 keeps leading and trailing spaces in the title", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Title").fill("  Buy milk  ");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(rows(page)).toHaveCount(1);
  expect((stub.lastPostBody as { title: string }).title).toBe("  Buy milk  ");
  expect(stub.tasks[0].title).toBe("  Buy milk  ");
});
