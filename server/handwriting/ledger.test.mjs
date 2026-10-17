import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Ledger } from "./ledger.mjs";

const START = Date.parse("2026-10-02T10:00:00Z");
function renewal(
  id,
  plan = "essential",
  start = START,
  end = START + 30 * 86400000,
) {
  return {
    id,
    userId: "u",
    type: "renewal",
    plan,
    cycleStart: start,
    cycleEnd: end,
    entitlementId: `cycle:${start}`,
  };
}
const pack = (id = "pack1", time = START) => ({
  id,
  userId: "u",
  type: "pack",
  purchasedAt: time,
  entitlementId: `purchase:${id}`,
});

test("one lifetime trial, ownership, atomic insufficient balance and idempotency", () => {
  const ledger = new Ledger(":memory:", () => START);
  assert.equal(ledger.usage("u").trialRemaining, 1);
  const first = ledger.reserve("u", { id: "q1", pages: 1 });
  assert.equal(ledger.reserve("u", { id: "q1", pages: 1 }).fresh, false);
  assert.equal(ledger.usage("u").trialRemaining, 0);
  assert.throws(
    () => ledger.reserve("u", { id: "q2", pages: 1 }),
    /insufficient_credits/,
  );
  assert.throws(
    () => ledger.document("another", first.document.id),
    /not_found/,
  );
  assert.equal(
    ledger.db.prepare("SELECT COUNT(*) AS count FROM documents").get().count,
    1,
  );
  ledger.update(first.document.id, "failed");
  assert.equal(ledger.usage("u").trialRemaining, 1);
  ledger.db.close();
});

test("concurrent requests across SQLite connections never overspend", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nodi-ledger-"));
  const a = new Ledger(join(directory, "ledger.sqlite"), () => START);
  const b = new Ledger(join(directory, "ledger.sqlite"), () => START);
  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => a.reserve("u", { id: "a", pages: 1 })),
    Promise.resolve().then(() => b.reserve("u", { id: "b", pages: 1 })),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(a.usage("u").trialRemaining, 0);
  a.db.close();
  b.db.close();
  rmSync(directory, { recursive: true });
});

test("earliest expiration first, paid renewal resets without rollover, no duplicate payment", () => {
  let now = START;
  const ledger = new Ledger(":memory:", () => now);
  ledger.payment(pack());
  ledger.payment(renewal("paid"));
  ledger.payment(renewal("paid"));
  ledger.reserve("u", { id: "q1", pages: 5 });
  assert.equal(ledger.usage("u").monthlyRemaining, 5);
  assert.equal(ledger.usage("u").additional[0].remaining, 10);
  assert.equal(ledger.usage("u").trialRemaining, 1);
  now = START + 30 * 86400000;
  ledger.payment(
    renewal("paid-next", "plus", START + 30 * 86400000, START + 60 * 86400000),
  );
  assert.equal(ledger.usage("u").monthlyRemaining, 30);
  assert.equal(ledger.usage("u").additional[0].remaining, 10);
  ledger.payment(
    renewal(
      "duplicate-event",
      "plus",
      START + 30 * 86400000,
      START + 60 * 86400000,
    ),
  );
  assert.equal(ledger.usage("u").monthlyRemaining, 30);
  ledger.db.close();
});

test("cancellation keeps paid cycle and purchased packs; expiration and refund revoke only affected credits", () => {
  let now = START;
  const ledger = new Ledger(":memory:", () => now);
  ledger.payment(renewal("sub"));
  ledger.payment(pack());
  ledger.payment({ id: "cancel", userId: "u", type: "cancel" });
  assert.equal(ledger.usage("u").renewalAt, null);
  assert.equal(ledger.usage("u").monthlyRemaining, 10);
  ledger.payment({ id: "expired", userId: "u", type: "expired" });
  assert.equal(ledger.usage("u").plan, "free");
  assert.equal(ledger.usage("u").additional[0].remaining, 10);
  ledger.payment(pack("other"));
  ledger.payment({
    id: "refund",
    userId: "u",
    type: "refund",
    entitlementId: "purchase:other",
  });
  assert.equal(ledger.usage("u").additional.length, 1);
  now = Date.parse("2027-10-02T10:00:01Z");
  assert.equal(ledger.usage("u").additional.length, 0);
  assert.equal(ledger.usage("u").trialRemaining, 1);
  ledger.db.close();
});

test("pending reservations survive restart; shared rate limiter spaces account-wide requests", () => {
  const directory = mkdtempSync(join(tmpdir(), "nodi-ledger-"));
  const db = join(directory, "ledger.sqlite");
  let ledger = new Ledger(db, () => START);
  const { document } = ledger.reserve("u", { id: "q", pages: 1 });
  ledger.update(document.id, "pending");
  assert.equal(ledger.providerSlot(), 0);
  assert.equal(ledger.providerSlot(), 550);
  ledger.db.close();
  ledger = new Ledger(db, () => START);
  assert.equal(ledger.usage("u").trialRemaining, 0);
  assert.equal(ledger.reserve("u", { id: "q", pages: 1 }).fresh, false);
  assert.equal(ledger.providerSlot(), 1100);
  ledger.db.close();
  rmSync(directory, { recursive: true });
});

test("reserves the effort's credits for the quoted pages and refunds them all", () => {
  const ledger = new Ledger(":memory:", () => 0);
  ledger.ensureUser("u");
  ledger.db
    .prepare("INSERT INTO grants VALUES('pack:u','u','pack',10,1,0)")
    .run();
  const { document } = ledger.reserve("u", { id: "q", pages: 2 }, 6);
  assert.equal(document.pages, 2);
  assert.equal(
    ledger.usage("u").trialRemaining +
      ledger.usage("u").additional[0].remaining,
    5,
  );
  ledger.update(document.id, "failed");
  assert.equal(ledger.usage("u").additional[0].remaining, 10);
  assert.throws(() => ledger.reserve("u", { id: "q2", pages: 2 }, 1), {
    code: "invalid_pages",
  });
  assert.throws(() => ledger.reserve("u", { id: "q3", pages: 2 }, 20), {
    code: "insufficient_credits",
  });
});
