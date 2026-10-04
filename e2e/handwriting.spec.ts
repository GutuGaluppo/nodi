import { expect, test } from "@playwright/test";

test("Handwriting replaces local image-to-note and Settings includes plans", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nota de imagem" }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "Handwriting · imagem ou PDF",
  );
  await expect(
    page.getByRole("button", { name: "Validar páginas" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Handwriting ainda não está disponível.", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Settings").click();
  await page.getByRole("button", { name: "Plan and usage" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan and usage" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy pages" })).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Plus", exact: true }),
  ).toBeVisible();
});

test("Handwriting controls remain visible at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nota de imagem" }).click();
  const dialog = page.getByRole("dialog");
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(390);
  await expect(page.getByLabel("Escolher imagem ou PDF")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Validar páginas" }),
  ).toBeVisible();
});

test("landing plans use shared prices and adapt to mobile and translated labels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/landing/index.html");
  await page.locator("#plans").scrollIntoViewIfNeeded();
  await expect(page.locator(".plan-card")).toHaveCount(4);
  await expect(page.locator(".plan-card.featured h3")).toHaveText("Plus");
  await expect(page.locator(".plan-card.featured")).toContainText("€9.99");
  await expect(page.locator(".plan-pack")).toContainText("€4.99");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator('button[data-lang="pt"]').click();
  await expect(page.locator("#plans-title")).toHaveText(
    "Páginas para Handwriting OCR",
  );
  await expect(page.locator(".plan-card.featured")).toContainText(
    "30 páginas por ciclo mensal de cobrança",
  );
  await expect(page.locator(".plan-card button").first()).toBeDisabled();
  await page.setViewportSize({ width: 1180, height: 760 });
  await expect(page.locator(".plans-grid")).toHaveCSS(
    "grid-template-columns",
    /\d+px \d+px \d+px \d+px/,
  );
});
