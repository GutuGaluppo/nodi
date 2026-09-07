import { expect, test } from "@playwright/test";

test("shows the NODI baseline and visual history", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "NODI" })).toBeVisible();
  await page.getByRole("button", { name: "About" }).click();
  await expect(
    page.getByRole("heading", { name: "The making of NODI" }),
  ).toBeVisible();
});

test("applies and restores the selected theme", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(21, 23, 21)",
  );

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
