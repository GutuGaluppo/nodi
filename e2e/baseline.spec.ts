import { expect, test } from "@playwright/test";

test("shows the NODI baseline and visual history", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "NODI" })).toBeVisible();
  await page.getByRole("button", { name: "About" }).click();
  await expect(
    page.getByRole("heading", { name: "The making of NODI" }),
  ).toBeVisible();
});
