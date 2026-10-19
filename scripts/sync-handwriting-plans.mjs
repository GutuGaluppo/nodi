import { readFile, writeFile } from "node:fs/promises";
import config from "../landing/plans.json" with { type: "json" };

const file = new URL("../landing/index.html", import.meta.url);
const html = await readFile(file, "utf8");
const price = (cents) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
const cards = config.plans
  .map(
    (
      plan,
    ) => `<article class="plan-card${plan.id === "plus" ? " featured" : ""}">
<h3>${plan.name}</h3><p class="plan-price">${price(plan.priceCents)}${plan.monthly ? '<span data-i18n="plans.month">/month</span>' : ""}</p>
<p ${plan.monthly ? `data-plan-pages="${plan.pages}"` : 'data-i18n="plans.trial"'}>${plan.monthly ? `${plan.pages} pages per monthly billing cycle` : "1 page to try, no subscription required. Once only."}</p>
<button class="btn" type="button" disabled data-i18n="plans.unavailable">Not available yet</button>
</article>`,
  )
  .join("\n");
const pack = `<article class="plan-pack"><h3>${config.pack.name}</h3><p>${price(config.pack.priceCents)} · <span data-i18n="plans.pack">${config.pack.pages} additional pages, valid for ${config.pack.validMonths} months</span></p><button class="btn" type="button" disabled data-i18n="plans.unavailable">Not available yet</button></article>`;
const generated = `<!-- HANDWRITING PLANS START -->\n<div class="plans-grid">${cards}</div>\n${pack}\n<!-- HANDWRITING PLANS END -->`;
const updated = html.replace(
  /<!-- HANDWRITING PLANS START -->[\s\S]*?<!-- HANDWRITING PLANS END -->/,
  generated,
);
if (updated === html && !html.includes(generated))
  throw new Error("Missing plans section");
if (process.argv.includes("--check")) {
  if (updated !== html)
    throw new Error("Plans are out of sync. Run pnpm plans:sync.");
} else await writeFile(file, updated);
