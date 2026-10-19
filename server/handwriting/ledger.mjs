import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import config from "../../landing/plans.json" with { type: "json" };

export class ServiceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** Server database, entirely separate from the desktop's local notes database. */
export class Ledger {
  constructor(path = ":memory:", now = () => Date.now()) {
    this.db = new DatabaseSync(path);
    this.now = now;
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'free', renewal INTEGER, latest_cycle INTEGER);
      CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), source TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0), expires INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), quote_id TEXT NOT NULL, pages INTEGER NOT NULL CHECK(pages>0), status TEXT NOT NULL, provider_id TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(user_id,quote_id));
      CREATE TABLE IF NOT EXISTS allocations(document_id TEXT NOT NULL REFERENCES documents(id), grant_id TEXT NOT NULL REFERENCES grants(id), amount INTEGER NOT NULL CHECK(amount>0), PRIMARY KEY(document_id,grant_id));
      CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_clock(id INTEGER PRIMARY KEY CHECK(id=1), next_request INTEGER NOT NULL);
      INSERT OR IGNORE INTO provider_clock VALUES(1,0);
    `);
  }
  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  ensureUser(user) {
    this.db.prepare("INSERT OR IGNORE INTO users(id) VALUES(?)").run(user);
    // Stable unique grant: once for the lifetime of the verified account.
    this.db
      .prepare("INSERT OR IGNORE INTO grants VALUES(?,?,'trial',1,NULL,0)")
      .run(`trial:${user}`, user);
  }
  available(user) {
    return this.db
      .prepare(
        `SELECT g.*, g.amount-COALESCE((SELECT SUM(a.amount) FROM allocations a JOIN documents d ON d.id=a.document_id WHERE a.grant_id=g.id AND d.status!='failed'),0) AS remaining FROM grants g WHERE user_id=? AND revoked=0 AND (expires IS NULL OR expires>?) ORDER BY COALESCE(expires,9223372036854775807),id`,
      )
      .all(user, this.now());
  }
  usage(user) {
    this.ensureUser(user);
    const account = this.db.prepare("SELECT * FROM users WHERE id=?").get(user);
    const grants = this.available(user);
    return {
      plan: grants.some((grant) => grant.source === "monthly")
        ? account.plan
        : "free",
      monthlyRemaining: grants
        .filter((g) => g.source === "monthly")
        .reduce((n, g) => n + g.remaining, 0),
      trialRemaining: grants
        .filter((g) => g.source === "trial")
        .reduce((n, g) => n + g.remaining, 0),
      additional: grants
        .filter((g) => g.source === "pack")
        .map((g) => ({
          remaining: g.remaining,
          expiresAt: new Date(g.expires).toISOString(),
        })),
      renewalAt:
        grants.some((grant) => grant.source === "monthly") && account.renewal
          ? new Date(account.renewal).toISOString()
          : null,
    };
  }
  /** Charges `credits` (pages times the effort's credits) for the quoted pages. */
  reserve(user, quote, credits = quote.pages) {
    return this.transaction(() => {
      this.ensureUser(user);
      const existing = this.db
        .prepare("SELECT * FROM documents WHERE user_id=? AND quote_id=?")
        .get(user, quote.id);
      if (existing) return { document: existing, fresh: false };
      if (
        !Number.isSafeInteger(quote.pages) ||
        quote.pages < 1 ||
        quote.pages > config.maxPages ||
        !Number.isSafeInteger(credits) ||
        credits < quote.pages
      )
        throw new ServiceError("invalid_pages");
      const grants = this.available(user);
      if (grants.reduce((n, g) => n + g.remaining, 0) < credits)
        throw new ServiceError("insufficient_credits", 402);
      const id = randomUUID();
      const now = this.now();
      this.db
        .prepare("INSERT INTO documents VALUES(?,?,?,?,'reserved',NULL,?,?)")
        .run(id, user, quote.id, quote.pages, now, now);
      let needed = credits;
      for (const grant of grants) {
        const amount = Math.min(needed, grant.remaining);
        if (amount > 0)
          this.db
            .prepare("INSERT INTO allocations VALUES(?,?,?)")
            .run(id, grant.id, amount);
        needed -= amount;
      }
      return { document: this.document(user, id), fresh: true };
    });
  }
  document(user, id) {
    const doc = this.db
      .prepare("SELECT * FROM documents WHERE user_id=? AND id=?")
      .get(user, id);
    if (!doc) throw new ServiceError("not_found", 404);
    return doc;
  }
  update(id, status, providerId = null) {
    this.db
      .prepare(
        "UPDATE documents SET status=?, provider_id=COALESCE(?,provider_id),updated=? WHERE id=?",
      )
      .run(status, providerId, this.now(), id);
  }
  /** DB-wide slot shared across instances; a single dedicated dispatcher is required. */
  providerSlot(delay = 0) {
    return this.transaction(() => {
      const { next_request: next } = this.db
        .prepare("SELECT next_request FROM provider_clock WHERE id=1")
        .get();
      const slot = Math.max(this.now() + delay, next);
      this.db
        .prepare("UPDATE provider_clock SET next_request=? WHERE id=1")
        .run(slot + 550);
      return Math.max(0, slot - this.now());
    });
  }
  /** Only called with events returned by the payment adapter's verified webhook. */
  payment(event) {
    return this.transaction(() => {
      if (this.db.prepare("SELECT id FROM payments WHERE id=?").get(event.id))
        return;
      this.ensureUser(event.userId);
      const now = this.now();
      if (event.type === "renewal") {
        const plan = config.plans.find((p) => p.id === event.plan && p.monthly);
        if (
          !plan ||
          !Number.isSafeInteger(event.cycleStart) ||
          !Number.isSafeInteger(event.cycleEnd) ||
          event.cycleEnd <= event.cycleStart ||
          event.cycleStart > now
        )
          throw new ServiceError("invalid_payment");
        const user = this.db
          .prepare("SELECT latest_cycle FROM users WHERE id=?")
          .get(event.userId);
        // Ignore delayed, older subscription events. Stable cycle ID stops double grants.
        if (!user.latest_cycle || event.cycleEnd > user.latest_cycle) {
          this.db
            .prepare(
              "UPDATE grants SET revoked=1 WHERE user_id=? AND source='monthly' AND id!=?",
            )
            .run(event.userId, event.entitlementId);
          this.db
            .prepare("INSERT OR IGNORE INTO grants VALUES(?,?,'monthly',?,?,0)")
            .run(event.entitlementId, event.userId, plan.pages, event.cycleEnd);
          this.db
            .prepare(
              "UPDATE users SET plan=?,renewal=?,latest_cycle=? WHERE id=?",
            )
            .run(plan.id, event.cycleEnd, event.cycleEnd, event.userId);
        }
      } else if (event.type === "pack") {
        if (!Number.isSafeInteger(event.purchasedAt) || event.purchasedAt > now)
          throw new ServiceError("invalid_payment");
        const expires = new Date(event.purchasedAt);
        expires.setUTCFullYear(expires.getUTCFullYear() + 1);
        this.db
          .prepare("INSERT OR IGNORE INTO grants VALUES(?,?,'pack',?,?,0)")
          .run(
            event.entitlementId,
            event.userId,
            config.pack.pages,
            expires.getTime(),
          );
      } else if (event.type === "cancel") {
        // Cancellation of auto-renewal preserves the paid cycle and separate packs.
        this.db
          .prepare("UPDATE users SET renewal=NULL WHERE id=?")
          .run(event.userId);
      } else if (event.type === "expired") {
        this.db
          .prepare(
            "UPDATE grants SET revoked=1 WHERE user_id=? AND source='monthly'",
          )
          .run(event.userId);
        this.db
          .prepare("UPDATE users SET plan='free',renewal=NULL WHERE id=?")
          .run(event.userId);
      } else if (event.type === "refund") {
        this.db
          .prepare("UPDATE grants SET revoked=1 WHERE user_id=? AND id=?")
          .run(event.userId, event.entitlementId);
      } else throw new ServiceError("invalid_payment");
      this.db
        .prepare("INSERT INTO payments VALUES(?,?,?)")
        .run(event.id, event.userId, now);
    });
  }
}
