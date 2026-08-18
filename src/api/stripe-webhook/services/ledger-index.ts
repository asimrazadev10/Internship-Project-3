import type { Core } from '@strapi/strapi';

/**
 * Guarantees a REAL database unique index on payment_events.event_id.
 *
 * Why this exists: Strapi's `unique: true` in schema.json is enforced by the
 * Document Service's validation layer, NOT by a database constraint — inspecting
 * the generated SQLite schema shows no unique index on the column. Since the
 * webhook writes through `strapi.db.query()` (which bypasses that validation
 * for speed), two concurrent deliveries of the same Stripe event would both
 * insert, and the "already processed" check would never fire.
 *
 * That is not a theoretical race. Stripe retries deliveries for up to three
 * days and explicitly does not promise at-most-once delivery, so duplicates are
 * ordinary traffic. Without a database-level constraint, exactly-once
 * fulfilment is a comment rather than a guarantee.
 *
 * Idempotent, and safe to run on every boot.
 */
export async function ensureEventLedgerIndex(strapi: Core.Strapi): Promise<void> {
  const knex = strapi.db.connection;

  // The index cannot be created while duplicates exist, so clear any that
  // predate it, keeping the earliest row for each event id.
  const removed = await knex.raw(
    `DELETE FROM payment_events
      WHERE id NOT IN (SELECT MIN(id) FROM payment_events GROUP BY event_id)`,
  );

  if (removed?.changes) {
    strapi.log.warn(
      `[stripe] removed ${removed.changes} duplicate payment_event row(s) before indexing`,
    );
  }

  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS payment_events_event_id_unique
       ON payment_events (event_id)`,
  );

  strapi.log.info('[stripe] payment_events.event_id unique index is in place');
}
