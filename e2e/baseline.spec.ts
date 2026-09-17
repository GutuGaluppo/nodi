import { expect, test } from "@playwright/test";

test("shows the NODI baseline and visual history", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "New note" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "NODI" })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Sidebar" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Notes" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Nothing selected" }),
  ).toBeVisible();
  await page.getByLabel("Settings").click();
  await page.getByRole("button", { name: "About NODI" }).click();
  await expect(
    page.getByRole("heading", { name: "The making of NODI" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/about/screenshots/privacy-001-private-notes.png",
  });
});

test("collapses and restores the Library", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Collapse Library" }).click();
  await expect(page.getByRole("region", { name: "Notes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Library" }).click();
  await expect(page.getByRole("region", { name: "Notes" })).toBeVisible();
});

test("applies and restores the selected theme", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Dark mode" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(21, 23, 21)",
  );

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("keeps all three desktop columns visible at the minimum width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");

  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  const noteList = page.getByRole("region", { name: "Notes" });
  const editor = page.getByRole("region", { name: "Nothing selected" });

  await expect(sidebar).toHaveCSS("width", "244px");
  await expect(noteList).toHaveCSS("width", "340px");
  await expect(editor).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
