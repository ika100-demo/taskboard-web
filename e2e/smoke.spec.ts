import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

test("the root page loads at the base URL @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// Browser-side validation only: no request leaves the browser, so these create no data.
test("AC-001.5 an empty title is refused with a message and keeps the due date @smoke", async ({ page }) => {
  const saves: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST") saves.push(req.url());
  });
  await page.goto("/");
  await page.getByLabel("Due date").fill("2026-05-06");
  await page.getByLabel("Title").fill("   ");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Enter a title.")).toBeVisible();
  await expect(page.getByLabel("Due date")).toHaveValue("2026-05-06");
  expect(saves).toEqual([]);
});

test("AC-001.6 a title of 201 characters is refused with a message and kept @smoke", async ({ page }) => {
  const saves: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST") saves.push(req.url());
  });
  await page.goto("/");
  const long = "a".repeat(201);
  await page.getByLabel("Title").fill(long);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("The title can have at most 200 characters.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue(long);
  expect(saves).toEqual([]);
});
