import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import {
  assumptionsSchema,
  b2bSchema,
  addMonths,
  breakEvenMonth,
  calculate,
  compare,
  contractTypeSchema,
  currencySchema,
  extrasSchema,
  fxOverrideSchema,
  normalizeOffer,
  offerInputSchema,
  rateTypeSchema,
  regimeIdSchema,
  resolveRules,
  runTimeline,
  toComparedItem,
  type Currency,
  type FxQuote,
  type OfferInput,
  type RegimeId,
  type TimelineAdjustments,
  type TimelineRaise,
} from "@offer-compare/engine";
import { hash as hashPassword, verify as verifyPassword } from "@node-rs/argon2";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import { sql } from "kysely";
import cron from "node-cron";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { loadRules, offerFromRow, quotesFor, settingsOverride, todayIso } from "./calcContext.js";
import { db, jsonb, withRls, type OffersTable, type UserSettingsTable } from "./db.js";
import { hasBnrToday, rateForMonth, refreshFx } from "./fx.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const offerWriteSchema = offerInputSchema.extend({
  label: z.string().min(1),
  assumptions: assumptionsSchema.optional(),
  extras: extrasSchema.optional(),
  b2b: b2bSchema.optional(),
  fx_override: fxOverrideSchema,
});

const adjustmentsSchema = z.object({
  annual_bonus_month: z.number().int().min(1).max(12).nullable().default(null),
  annual_bonus_gross: z.number().nonnegative().default(0),
  annual_bonus_currency: currencySchema.default("RON"),
  one_offs: z
    .array(
      z.object({
        month_index: z.number().int().min(0),
        gross: z.number().nonnegative(),
        currency: currencySchema,
      }),
    )
    .default([]),
});

const raiseSchema = z.object({
  effective_month_index: z.number().int().min(0),
  kind: z.enum(["percent", "flat"]),
  base: z.enum(["gross", "net"]).default("gross"),
  value: z.number(),
  new_rate_type: rateTypeSchema.nullable().optional(),
  new_currency: currencySchema.nullable().optional(),
  contract_type_change: contractTypeSchema.nullable().optional(),
  compounding: z.boolean().default(true),
  note: z.string().default(""),
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

async function requireUser(request: FastifyRequest): Promise<{ id: string; email: string }> {
  const payload = await request.jwtVerify<{ sub: string; email: string }>();
  return { id: payload.sub, email: payload.email };
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues[0]?.message ?? "Invalid input" });
    }
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) request.log.error(error);
    return reply.code(statusCode).send({ error: statusCode >= 500 ? "Internal error" : error.message });
  });

  app.get("/api/health", async () => {
    await sql`select 1`.execute(db);
    return { ok: true };
  });

  app.post("/api/auth/register", async (request, reply) => {
    if (!config.allowRegistration) throw httpError(403, "Registration is closed");
    const body = registerSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const existing = await db.selectFrom("users").select("id").where("email", "=", email).executeTakeFirst();
    if (existing) throw httpError(409, "An account with that email already exists");
    const id = randomUUID();
    const password_hash = await hashPassword(body.password);
    await db.transaction().execute(async (trx) => {
      await sql`select set_config('app.user_id', ${id}, true)`.execute(trx);
      await trx
        .insertInto("users")
        .values({ id, email, password_hash, created_at: new Date() })
        .execute();
      await trx
        .insertInto("user_settings")
        .values({
          user_id: id,
          display_currency: "RON",
          hours_per_day: 8,
          working_days_per_month: 21,
          billable_days_per_year: 220,
          fx_override: null,
          fx_drift_percent: 0,
          inflation_rate_percent: 0,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    });
    return reply.code(201).send(await issueTokens(app, id, email));
  });

  app.post("/api/auth/login", async (request) => {
    const body = registerSchema.parse(request.body);
    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", body.email.toLowerCase())
      .executeTakeFirst();
    if (!user || !(await verifyPassword(user.password_hash, body.password))) {
      throw httpError(401, "Invalid email or password");
    }
    return issueTokens(app, user.id, user.email);
  });

  app.post("/api/auth/refresh", async (request) => {
    const body = z.object({ refresh_token: z.string().min(10) }).parse(request.body);
    const row = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("token_hash", "=", sha256(body.refresh_token))
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    if (!row || row.expires_at.getTime() < Date.now()) throw httpError(401, "Refresh token expired");
    await db.updateTable("refresh_tokens").set({ revoked_at: new Date() }).where("id", "=", row.id).execute();
    const user = await db.selectFrom("users").selectAll().where("id", "=", row.user_id).executeTakeFirst();
    if (!user) throw httpError(401, "Unknown user");
    return issueTokens(app, user.id, user.email);
  });

  app.post("/api/auth/logout", async (request) => {
    const body = z.object({ refresh_token: z.string().min(10) }).parse(request.body);
    await db
      .updateTable("refresh_tokens")
      .set({ revoked_at: new Date() })
      .where("token_hash", "=", sha256(body.refresh_token))
      .execute();
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => {
    const user = await requireUser(request);
    return user;
  });

  app.get("/api/offers", async (request) => {
    const user = await requireUser(request);
    const rows = await withRls(user.id, (trx) =>
      trx.selectFrom("offers").selectAll().orderBy("is_current", "desc").orderBy("created_at", "asc").execute(),
    );
    return rows.map(publicOffer);
  });

  app.post("/api/offers", async (request, reply) => {
    const user = await requireUser(request);
    const body = offerWriteSchema.parse(request.body);
    const normalized = normalizeOffer(body);
    const id = randomUUID();
    await withRls(user.id, async (trx) => {
      if (normalized.is_current) {
        await trx.updateTable("offers").set({ is_current: false }).where("is_current", "=", true).execute();
      }
      await trx
        .insertInto("offers")
        .values({
          id,
          user_id: user.id,
          label: normalized.label,
          contract_type: normalized.contract_type,
          amount: normalized.amount,
          rate_type: normalized.rate_type,
          currency: normalized.currency,
          assumptions: jsonb(normalized.assumptions),
          extras: jsonb(normalized.extras),
          b2b: jsonb(normalized.b2b),
          fx_override: jsonb(normalized.fx_override),
          status: normalized.is_current ? "current" : normalized.status,
          is_current: normalized.is_current,
          notes: normalized.notes,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    });
    const created = await withRls(user.id, (trx) =>
      trx.selectFrom("offers").selectAll().where("id", "=", id).executeTakeFirst(),
    );
    return reply.code(201).send(publicOffer(created!));
  });

  app.get("/api/offers/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const row = await withRls(user.id, (trx) =>
      trx.selectFrom("offers").selectAll().where("id", "=", id).executeTakeFirst(),
    );
    if (!row) throw httpError(404, "Offer not found");
    return publicOffer(row);
  });

  app.patch("/api/offers/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = offerWriteSchema.partial().parse(request.body);
    await withRls(user.id, async (trx) => {
      const current = await trx.selectFrom("offers").selectAll().where("id", "=", id).executeTakeFirst();
      if (!current) throw httpError(404, "Offer not found");
      const merged = normalizeOffer({ ...offerFromRow(current), ...body });
      if (merged.is_current) {
        await trx
          .updateTable("offers")
          .set({ is_current: false })
          .where("is_current", "=", true)
          .where("id", "!=", id)
          .execute();
      }
      await trx
        .updateTable("offers")
        .set({
          label: merged.label,
          contract_type: merged.contract_type,
          amount: merged.amount,
          rate_type: merged.rate_type,
          currency: merged.currency,
          assumptions: jsonb(merged.assumptions),
          extras: jsonb(merged.extras),
          b2b: jsonb(merged.b2b),
          fx_override: jsonb(merged.fx_override),
          status: merged.is_current ? "current" : merged.status === "current" ? "idea" : merged.status,
          is_current: merged.is_current,
          notes: merged.notes,
        })
        .where("id", "=", id)
        .execute();
    });
    const row = await withRls(user.id, (trx) =>
      trx.selectFrom("offers").selectAll().where("id", "=", id).executeTakeFirst(),
    );
    return publicOffer(row!);
  });

  app.delete("/api/offers/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const result = await withRls(user.id, (trx) => trx.deleteFrom("offers").where("id", "=", id).executeTakeFirst());
    if (Number(result.numDeletedRows) === 0) throw httpError(404, "Offer not found");
    return { ok: true };
  });

  app.get("/api/settings", async (request) => {
    const user = await requireUser(request);
    return withRls(user.id, (trx) =>
      trx.selectFrom("user_settings").selectAll().where("user_id", "=", user.id).executeTakeFirst(),
    );
  });

  app.put("/api/settings", async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({
        display_currency: currencySchema.optional(),
        hours_per_day: z.number().positive().optional(),
        working_days_per_month: z.number().positive().optional(),
        billable_days_per_year: z.number().positive().optional(),
        fx_override: fxOverrideSchema,
        fx_drift_percent: z.number().optional(),
        inflation_rate_percent: z.number().optional(),
      })
      .parse(request.body);
    await withRls(user.id, (trx) =>
      trx
        .updateTable("user_settings")
        .set({
          ...(body.display_currency ? { display_currency: body.display_currency } : {}),
          ...(body.hours_per_day != null ? { hours_per_day: body.hours_per_day } : {}),
          ...(body.working_days_per_month != null ? { working_days_per_month: body.working_days_per_month } : {}),
          ...(body.billable_days_per_year != null ? { billable_days_per_year: body.billable_days_per_year } : {}),
          ...(body.fx_drift_percent != null ? { fx_drift_percent: body.fx_drift_percent } : {}),
          ...(body.inflation_rate_percent != null ? { inflation_rate_percent: body.inflation_rate_percent } : {}),
          ...(body.fx_override !== undefined ? { fx_override: jsonb(body.fx_override) } : {}),
        })
        .where("user_id", "=", user.id)
        .execute(),
    );
    return withRls(user.id, (trx) =>
      trx.selectFrom("user_settings").selectAll().where("user_id", "=", user.id).executeTakeFirst(),
    );
  });

  app.get("/api/tax-rules", async (request) => {
    await requireUser(request);
    return db.selectFrom("tax_rules").selectAll().orderBy("key").orderBy("effective_from").execute();
  });

  app.post("/api/tax-rules", async (request, reply) => {
    await requireUser(request);
    const body = z
      .object({
        tax_year: z.number().int(),
        effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        key: z.string().min(1),
        value: z.unknown(),
        note: z.string().default(""),
        verified: z.boolean().default(false),
      })
      .parse(request.body);
    const id = randomUUID();
    await db
      .insertInto("tax_rules")
      .values({
        id,
        tax_year: body.tax_year,
        effective_from: body.effective_from,
        key: body.key,
        value: jsonb(body.value),
        note: body.note,
        verified: body.verified,
      })
      .execute();
    const row = await db.selectFrom("tax_rules").selectAll().where("id", "=", id).executeTakeFirst();
    return reply.code(201).send(row);
  });

  app.patch("/api/tax-rules/:id", async (request) => {
    await requireUser(request);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        value: z.unknown().optional(),
        note: z.string().optional(),
        verified: z.boolean().optional(),
        effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(request.body);
    await db
      .updateTable("tax_rules")
      .set({
        ...(body.value !== undefined ? { value: jsonb(body.value) } : {}),
        ...(body.note != null ? { note: body.note } : {}),
        ...(body.verified != null ? { verified: body.verified } : {}),
        ...(body.effective_from ? { effective_from: body.effective_from } : {}),
      })
      .where("id", "=", id)
      .execute();
    const row = await db.selectFrom("tax_rules").selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) throw httpError(404, "Tax rule not found");
    return row;
  });

  app.get("/api/inflation", async (request) => {
    await requireUser(request);
    return db.selectFrom("inflation_assumptions").selectAll().orderBy("year").execute();
  });

  app.put("/api/inflation/:year", async (request) => {
    await requireUser(request);
    const { year } = request.params as { year: string };
    const body = z.object({ annual_rate_percent: z.number(), note: z.string().optional() }).parse(request.body);
    const yearNum = Number(year);
    const existing = await db
      .selectFrom("inflation_assumptions")
      .selectAll()
      .where("year", "=", yearNum)
      .executeTakeFirst();
    if (existing) {
      await db
        .updateTable("inflation_assumptions")
        .set({ annual_rate_percent: body.annual_rate_percent, ...(body.note != null ? { note: body.note } : {}) })
        .where("year", "=", yearNum)
        .execute();
    } else {
      await db
        .insertInto("inflation_assumptions")
        .values({
          id: randomUUID(),
          year: yearNum,
          annual_rate_percent: body.annual_rate_percent,
          note: body.note ?? "",
        })
        .execute();
    }
    return db.selectFrom("inflation_assumptions").selectAll().where("year", "=", yearNum).executeTakeFirst();
  });

  app.delete("/api/inflation/:year", async (request) => {
    await requireUser(request);
    const { year } = request.params as { year: string };
    await db.deleteFrom("inflation_assumptions").where("year", "=", Number(year)).execute();
    return { ok: true };
  });

  app.get("/api/fx", async (request) => {
    await requireUser(request);
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 60), 500);
    return db.selectFrom("fx_rates").selectAll().orderBy("date", "desc").limit(limit).execute();
  });

  app.post("/api/fx/refresh", async (request) => {
    await requireUser(request);
    return refreshFx();
  });

  app.post("/api/calculate", async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({
        offer: offerWriteSchema,
        as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        display_currency: currencySchema.optional(),
      })
      .parse(request.body);
    const settings = await loadSettings(user.id);
    const asOf = body.as_of ?? todayIso();
    const display = body.display_currency ?? settings?.display_currency ?? "RON";
    const offer = normalizeOffer(body.offer);
    const rules = await loadRules(asOf);
    const quotes = await quotesFor({
      asOf,
      offerCurrency: offer.currency,
      displayCurrency: display,
      offerOverride: offer.fx_override,
      globalOverride: settingsOverride(settings),
    });
    return calculate({ offer, rules, ...quotes });
  });

  app.post("/api/compare", async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({
        offer_ids: z.array(z.string().uuid()).optional(),
        regimes: z.record(z.string(), regimeIdSchema).optional(),
        baseline_id: z.string().uuid().nullable().optional(),
        pair: z.object({ a: z.string(), b: z.string() }).nullable().optional(),
        chain: z.array(z.string()).optional(),
        display_currency: currencySchema.optional(),
      })
      .parse(request.body);
    const settings = await loadSettings(user.id);
    const display = body.display_currency ?? settings?.display_currency ?? "RON";
    const rows = await withRls(user.id, (trx) => trx.selectFrom("offers").selectAll().execute());
    const selected = body.offer_ids?.length ? rows.filter((row) => body.offer_ids!.includes(row.id)) : rows;
    const asOf = todayIso();
    const items = [];
    for (const row of selected) {
      const offer = offerFromRow(row);
      const rules = await loadRules(asOf);
      const quotes = await quotesFor({
        asOf,
        offerCurrency: offer.currency,
        displayCurrency: display,
        offerOverride: offer.fx_override,
        globalOverride: settingsOverride(settings),
      });
      const result = calculate({ offer, rules, ...quotes });
      items.push(
        toComparedItem({
          id: row.id,
          label: row.label,
          status: row.status,
          is_current: row.is_current,
          original_amount: row.amount,
          original_rate_type: row.rate_type,
          original_currency: row.currency,
          result,
          regime: body.regimes?.[row.id],
          display_currency: display,
          display_rate_to_ron: quotes.display.rate_to_ron,
        }),
      );
    }
    const baseline = body.baseline_id ?? rows.find((row) => row.is_current)?.id ?? null;
    return compare({
      items,
      baseline_id: baseline,
      pair: body.pair ?? null,
      chain: body.chain ?? [],
      display_currency: display,
    });
  });

  app.post("/api/scenarios", async (request, reply) => {
    const user = await requireUser(request);
    const body = z.object({ offer_id: z.string().uuid(), regime: regimeIdSchema.optional() }).parse(request.body);
    const row = await withRls(user.id, (trx) =>
      trx.selectFrom("offers").selectAll().where("id", "=", body.offer_id).executeTakeFirst(),
    );
    if (!row) throw httpError(404, "Offer not found");
    const settings = await loadSettings(user.id);
    const offer = offerFromRow(row);
    if (body.regime && offer.b2b) offer.b2b = { ...normalizeOffer(offer).b2b, regime: body.regime };
    const asOf = todayIso();
    const rules = await loadRules(asOf);
    const quotes = await quotesFor({
      asOf,
      offerCurrency: offer.currency,
      displayCurrency: settings?.display_currency ?? "RON",
      offerOverride: offer.fx_override,
      globalOverride: settingsOverride(settings),
    });
    const result = calculate({ offer, rules, ...quotes });
    const id = randomUUID();
    await withRls(user.id, (trx) =>
      trx
        .insertInto("scenarios")
        .values({
          id,
          user_id: user.id,
          offer_id: row.id,
          regime: result.selected_regime,
          inputs: jsonb(offer),
          result: jsonb(result),
          rules_snapshot: jsonb(rules),
          fx_snapshot: jsonb(quotes),
          created_at: new Date(),
        })
        .execute(),
    );
    return reply.code(201).send({ id, result });
  });

  app.get("/api/scenarios", async (request) => {
    const user = await requireUser(request);
    return withRls(user.id, (trx) =>
      trx.selectFrom("scenarios").selectAll().orderBy("created_at", "desc").limit(50).execute(),
    );
  });

  app.get("/api/timelines", async (request) => {
    const user = await requireUser(request);
    return withRls(user.id, async (trx) => {
      const rows = await trx.selectFrom("timelines").selectAll().orderBy("created_at", "desc").execute();
      const ids = rows.map((row) => row.id);
      const tracks = ids.length
        ? await trx.selectFrom("timeline_tracks").selectAll().where("timeline_id", "in", ids).execute()
        : [];
      return rows.map((row) => ({
        ...row,
        tracks: tracks.filter((track) => track.timeline_id === row.id),
      }));
    });
  });

  app.post("/api/timelines", async (request, reply) => {
    const user = await requireUser(request);
    const body = z
      .object({
        label: z.string().min(1),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        horizon_months: z.number().int().min(1).max(600),
        notes: z.string().default(""),
        fx_drift_percent: z.number().default(0),
        use_inflation: z.boolean().default(false),
      })
      .parse(request.body);
    const id = randomUUID();
    await withRls(user.id, (trx) =>
      trx
        .insertInto("timelines")
        .values({
          id,
          user_id: user.id,
          label: body.label,
          start_date: body.start_date,
          horizon_months: body.horizon_months,
          notes: body.notes,
          fx_drift_percent: body.fx_drift_percent,
          use_inflation: body.use_inflation,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute(),
    );
    return reply.code(201).send(await loadTimeline(user.id, id));
  });

  app.get("/api/timelines/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return loadTimeline(user.id, id);
  });

  app.patch("/api/timelines/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        label: z.string().min(1).optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        horizon_months: z.number().int().min(1).max(600).optional(),
        notes: z.string().optional(),
        fx_drift_percent: z.number().optional(),
        use_inflation: z.boolean().optional(),
      })
      .parse(request.body);
    await withRls(user.id, (trx) => trx.updateTable("timelines").set(body).where("id", "=", id).execute());
    return loadTimeline(user.id, id);
  });

  app.delete("/api/timelines/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    await withRls(user.id, (trx) => trx.deleteFrom("timelines").where("id", "=", id).execute());
    return { ok: true };
  });

  app.post("/api/timelines/:id/tracks", async (request, reply) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        label: z.string().min(1),
        base_offer_id: z.string().uuid(),
        regime: regimeIdSchema.default("best"),
        color: z.string().default("#0f766e"),
        adjustments: adjustmentsSchema.optional(),
      })
      .parse(request.body);
    const trackId = randomUUID();
    await withRls(user.id, async (trx) => {
      const timeline = await trx.selectFrom("timelines").select("id").where("id", "=", id).executeTakeFirst();
      if (!timeline) throw httpError(404, "Timeline not found");
      const count = await trx
        .selectFrom("timeline_tracks")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("timeline_id", "=", id)
        .executeTakeFirst();
      await trx
        .insertInto("timeline_tracks")
        .values({
          id: trackId,
          timeline_id: id,
          label: body.label,
          base_offer_id: body.base_offer_id,
          regime: body.regime,
          color: body.color,
          adjustments: jsonb(adjustmentsSchema.parse(body.adjustments ?? {})),
          position: Number(count?.count ?? 0),
        })
        .execute();
    });
    return reply.code(201).send(await loadTimeline(user.id, id));
  });

  app.patch("/api/tracks/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        label: z.string().min(1).optional(),
        regime: regimeIdSchema.optional(),
        color: z.string().optional(),
        adjustments: adjustmentsSchema.optional(),
        base_offer_id: z.string().uuid().optional(),
      })
      .parse(request.body);
    await withRls(user.id, (trx) =>
      trx
        .updateTable("timeline_tracks")
        .set({
          ...(body.label ? { label: body.label } : {}),
          ...(body.regime ? { regime: body.regime } : {}),
          ...(body.color ? { color: body.color } : {}),
          ...(body.base_offer_id ? { base_offer_id: body.base_offer_id } : {}),
          ...(body.adjustments ? { adjustments: jsonb(adjustmentsSchema.parse(body.adjustments)) } : {}),
        })
        .where("id", "=", id)
        .execute(),
    );
    return { ok: true };
  });

  app.delete("/api/tracks/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    await withRls(user.id, (trx) => trx.deleteFrom("timeline_tracks").where("id", "=", id).execute());
    return { ok: true };
  });

  app.post("/api/tracks/:id/raises", async (request, reply) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = raiseSchema.parse(request.body);
    const raiseId = randomUUID();
    await withRls(user.id, (trx) =>
      trx
        .insertInto("raise_events")
        .values({
          id: raiseId,
          track_id: id,
          effective_month_index: body.effective_month_index,
          kind: body.kind,
          base: body.base,
          value: body.value,
          new_rate_type: body.new_rate_type ?? null,
          new_currency: body.new_currency ?? null,
          contract_type_change: body.contract_type_change ?? null,
          compounding: body.compounding,
          note: body.note,
        })
        .execute(),
    );
    return reply.code(201).send({ id: raiseId });
  });

  app.delete("/api/raises/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    await withRls(user.id, (trx) => trx.deleteFrom("raise_events").where("id", "=", id).execute());
    return { ok: true };
  });

  app.post("/api/timelines/:id/run", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        display_currency: currencySchema.optional(),
        pair: z.object({ a: z.string(), b: z.string() }).nullable().optional(),
        force: z.boolean().optional(),
      })
      .parse(request.body ?? {});
    const timeline = await loadTimeline(user.id, id);
    const settings = await loadSettings(user.id);
    const offers = await withRls(user.id, (trx) => trx.selectFrom("offers").selectAll().execute());
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    return executeTimeline({
      userId: user.id,
      settings,
      display: body.display_currency ?? settings?.display_currency ?? "RON",
      start_date: timeline.start_date,
      horizon_months: timeline.horizon_months,
      fx_drift_percent: timeline.fx_drift_percent,
      use_inflation: timeline.use_inflation,
      pair: body.pair ?? null,
      force: body.force ?? false,
      persist: true,
      tracks: timeline.tracks.map((track) => {
        const row = track.base_offer_id ? byId.get(track.base_offer_id) : undefined;
        if (!row) throw httpError(400, `Track ${track.label} has no offer`);
        return {
          id: track.id,
          label: track.label,
          color: track.color,
          regime: track.regime as RegimeId,
          offer: offerFromRow(row),
          raises: track.raises.map(toRaise),
          adjustments: adjustmentsSchema.parse(track.adjustments ?? {}),
        };
      }),
    });
  });

  app.post("/api/timelines/preview", async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({
        start_date: z.string(),
        horizon_months: z.number().int().min(1).max(600),
        fx_drift_percent: z.number().default(0),
        use_inflation: z.boolean().default(false),
        display_currency: currencySchema.optional(),
        pair: z.object({ a: z.string(), b: z.string() }).nullable().optional(),
        tracks: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            color: z.string(),
            regime: regimeIdSchema,
            offer: offerWriteSchema,
            raises: z.array(raiseSchema).default([]),
            adjustments: adjustmentsSchema.optional(),
          }),
        ),
      })
      .parse(request.body);
    const settings = await loadSettings(user.id);
    return executeTimeline({
      userId: user.id,
      settings,
      display: body.display_currency ?? settings?.display_currency ?? "RON",
      start_date: body.start_date,
      horizon_months: body.horizon_months,
      fx_drift_percent: body.fx_drift_percent,
      use_inflation: body.use_inflation,
      pair: body.pair ?? null,
      force: true,
      persist: false,
      tracks: body.tracks.map((track) => ({
        id: track.id,
        label: track.label,
        color: track.color,
        regime: track.regime,
        offer: normalizeOffer(track.offer),
        raises: track.raises.map(toRaise),
        adjustments: adjustmentsSchema.parse(track.adjustments ?? {}),
      })),
    });
  });

  async function loadSettings(userId: string): Promise<UserSettingsTable | undefined> {
    return withRls(userId, (trx) =>
      trx.selectFrom("user_settings").selectAll().where("user_id", "=", userId).executeTakeFirst(),
    );
  }

  return app;
}

function toRaise(raise: z.infer<typeof raiseSchema>): TimelineRaise {
  return {
    effective_month_index: raise.effective_month_index,
    kind: raise.kind,
    base: raise.base,
    value: raise.value,
    new_rate_type: raise.new_rate_type ?? null,
    new_currency: raise.new_currency ?? null,
    contract_type_change: raise.contract_type_change ?? null,
    compounding: raise.compounding,
  };
}

function publicOffer(row: OffersTable) {
  return {
    ...row,
    assumptions: row.assumptions ?? {},
    extras: row.extras ?? {},
    b2b: row.b2b ?? {},
    fx_override: row.fx_override ?? null,
  };
}

async function issueTokens(
  app: { jwt: { sign: (payload: object, options: { expiresIn: string }) => string } },
  userId: string,
  email: string,
) {
  const access_token = app.jwt.sign({ sub: userId, email }, { expiresIn: config.jwtAccessTtl });
  const refresh_token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
  await db
    .insertInto("refresh_tokens")
    .values({
      id: randomUUID(),
      user_id: userId,
      token_hash: sha256(refresh_token),
      expires_at: expires,
      revoked_at: null,
      created_at: new Date(),
    })
    .execute();
  return { access_token, refresh_token, user: { id: userId, email } };
}

async function loadTimeline(userId: string, id: string) {
  return withRls(userId, async (trx) => {
    const timeline = await trx.selectFrom("timelines").selectAll().where("id", "=", id).executeTakeFirst();
    if (!timeline) throw httpError(404, "Timeline not found");
    const tracks = await trx
      .selectFrom("timeline_tracks")
      .selectAll()
      .where("timeline_id", "=", id)
      .orderBy("position")
      .execute();
    const trackIds = tracks.map((track) => track.id);
    const raises = trackIds.length
      ? await trx.selectFrom("raise_events").selectAll().where("track_id", "in", trackIds).execute()
      : [];
    return {
      ...timeline,
      tracks: tracks.map((track) => ({
        ...track,
        raises: raises.filter((raise) => raise.track_id === track.id),
      })),
    };
  });
}

function inflationRate(
  rows: { year: number; annual_rate_percent: number }[],
  year: number,
  settings: UserSettingsTable | undefined,
): number {
  const row = rows.find((item) => item.year === year) ?? [...rows].sort((a, b) => b.year - a.year)[0];
  const percent = row?.annual_rate_percent ?? settings?.inflation_rate_percent ?? 0;
  return percent / 100;
}

async function executeTimeline(input: {
  userId: string;
  settings: UserSettingsTable | undefined;
  display: Currency;
  start_date: string;
  horizon_months: number;
  fx_drift_percent: number;
  use_inflation: boolean;
  pair: { a: string; b: string } | null;
  force: boolean;
  persist: boolean;
  tracks: {
    id: string;
    label: string;
    color: string;
    regime: RegimeId;
    offer: OfferInput;
    raises: TimelineRaise[];
    adjustments: TimelineAdjustments;
  }[];
}) {
  const allRules = await db.selectFrom("tax_rules").selectAll().execute();
  const fxRows = await db.selectFrom("fx_rates").select(["date", "currency", "rate_to_ron", "source"]).execute();
  const inflationRows = await db.selectFrom("inflation_assumptions").selectAll().execute();
  const ruleRows = allRules.map((row) => ({
    key: row.key,
    effective_from: row.effective_from,
    value: row.value,
    note: row.note,
    verified: row.verified,
    tax_year: row.tax_year,
  }));
  const fingerprint = sha256(
    JSON.stringify({ ruleRows, fxRows, inflationRows, display: input.display, drift: input.fx_drift_percent }),
  );
  await preloadRates(input.start_date, input.horizon_months, input.fx_drift_percent);
  const globalOverride = settingsOverride(input.settings);
  const tracks = [];
  for (const track of input.tracks) {
    const hash = sha256(
      JSON.stringify({
        fingerprint,
        offer: track.offer,
        raises: track.raises,
        adjustments: track.adjustments,
        regime: track.regime,
        start: input.start_date,
        horizon: input.horizon_months,
        inflation: input.use_inflation,
      }),
    );
    if (input.persist && !input.force) {
      const cached = await withRls(input.userId, (trx) =>
        trx
          .selectFrom("timeline_runs")
          .selectAll()
          .where("track_id", "=", track.id)
          .where("inputs_hash", "=", hash)
          .orderBy("computed_at", "desc")
          .executeTakeFirst(),
      );
      if (cached) {
        tracks.push({
          id: track.id,
          label: track.label,
          color: track.color,
          months: cached.monthly_series,
          aggregates: cached.aggregates,
          cached: true,
        });
        continue;
      }
    }
    const series = runTimeline({
      start_date: input.start_date,
      horizon_months: input.horizon_months,
      display_currency: input.display,
      use_inflation: input.use_inflation,
      pair: null,
      tracks: [track],
      rules_for: (month) => resolveRules(ruleRows, month, todayIso()),
      fx_for: (month, currency) => syncRate(month, currency, input.fx_drift_percent, globalOverride),
      inflation_for_year: (year) => inflationRate(inflationRows, year, input.settings),
    });
    const computed = series.tracks[0];
    if (input.persist) {
      await withRls(input.userId, (trx) =>
        trx
          .insertInto("timeline_runs")
          .values({
            id: randomUUID(),
            track_id: track.id,
            computed_at: new Date(),
            monthly_series: jsonb(computed.months),
            aggregates: jsonb(computed.aggregates),
            inputs_hash: hash,
          })
          .execute(),
      );
    }
    tracks.push({ ...computed, cached: false });
  }

  let pair = null;
  if (input.pair) {
    const a = tracks.find((track) => track.id === input.pair!.a);
    const b = tracks.find((track) => track.id === input.pair!.b);
    if (a && b) {
      const aNets = (a.months as { net_monthly_ron: number }[]).map((month) => month.net_monthly_ron);
      const bNets = (b.months as { net_monthly_ron: number }[]).map((month) => month.net_monthly_ron);
      const crossing = breakEvenMonth(aNets, bNets);
      pair = {
        a: a.id,
        b: b.id,
        break_even_month_index: crossing.index,
        ahead_from_start: crossing.ahead_from_start,
        monthly_delta_ron: aNets.map((net, index) => Math.round((bNets[index] - net) * 100) / 100),
        cumulative_net_difference_ron:
          (b.aggregates as { cumulative_net_ron: number }).cumulative_net_ron -
          (a.aggregates as { cumulative_net_ron: number }).cumulative_net_ron,
      };
    }
  }
  return { tracks, pair, display_currency: input.display };
}

const rateCache = new Map<string, FxQuote>();

function syncRate(month: string, currency: Currency, drift: number, globalOverride: OfferInput["fx_override"]): FxQuote {
  if (currency === "RON") return { currency: "RON", rate_to_ron: 1, date: null, source: "identity" };
  const manual = globalOverride?.[currency];
  if (manual) return { currency, rate_to_ron: manual, date: null, source: "global_override" };
  const hit = rateCache.get(`${month}:${currency}:${drift}`);
  if (hit) return hit;
  throw new Error(`No FX rate for ${currency} on ${month}. Refresh rates or set an override.`);
}

async function preloadRates(start: string, horizon: number, drift: number): Promise<void> {
  rateCache.clear();
  for (let i = 0; i < horizon; i++) {
    const month = addMonths(start, i);
    for (const currency of ["EUR", "USD"] as const) {
      try {
        rateCache.set(`${month}:${currency}:${drift}`, await rateForMonth(currency, month, drift));
      } catch (error) {
        console.error(error);
      }
    }
  }
}

export function startScheduler() {
  const run = () => {
    refreshFx().catch((error) => console.error("FX refresh failed", error));
  };
  hasBnrToday()
    .then((ok) => {
      if (!ok) run();
    })
    .catch((error) => console.error(error));
  cron.schedule("0 15 * * *", run, { timezone: "UTC" });
}

