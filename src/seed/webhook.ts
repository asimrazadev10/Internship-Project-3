import type { Core } from '@strapi/strapi';

const WEBHOOK_NAME = 'nextjs-isr';

// Strapi fires these for every content type; the frontend decides which of
// them matter by looking at the model in the payload.
const EVENTS = [
  'entry.create',
  'entry.update',
  'entry.delete',
  'entry.publish',
  'entry.unpublish',
];

interface StoredWebhook {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  events: string[];
  isEnabled: boolean;
}

interface WebhookStore {
  findWebhooks(): Promise<StoredWebhook[] | undefined>;
  createWebhook(data: Omit<StoredWebhook, 'id'>): Promise<StoredWebhook>;
  updateWebhook(id: string, data: Omit<StoredWebhook, 'id'>): Promise<StoredWebhook>;
}

interface WebhookRunner {
  add(webhook: StoredWebhook): void;
  update(webhook: StoredWebhook): void;
}

/**
 * Points Strapi at the Next.js revalidation endpoint.
 *
 * Idempotent and self-healing: looks the webhook up by name. Creates it when
 * absent. When present, reconciles its url/secret against the current env so
 * that a changed FRONTEND_URL or REVALIDATE_SECRET is picked up on the next
 * restart instead of silently leaving deliveries pointed at stale values.
 */
export async function registerIsrWebhook(strapi: Core.Strapi): Promise<void> {
  const store = strapi.get('webhookStore') as WebhookStore;
  const runner = strapi.get('webhookRunner') as WebhookRunner;
  const existing = (await store.findWebhooks()) ?? [];

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const desiredUrl = `${frontendUrl}/api/revalidate`;
  const desiredHeaders = {
    'x-revalidate-secret': process.env.REVALIDATE_SECRET ?? 'dev-secret-change-me',
  };

  const found = existing.find((webhook) => webhook.name === WEBHOOK_NAME);

  if (!found) {
    const created = await store.createWebhook({
      name: WEBHOOK_NAME,
      url: desiredUrl,
      headers: desiredHeaders,
      events: EVENTS,
      isEnabled: true,
    });

    // The core provider loads webhooks into the runner during its own
    // bootstrap, which has already happened by the time this runs.
    // Registering the new webhook directly makes it live now rather than
    // after the next restart.
    runner.add(created);

    strapi.log.info(`[isr] registered webhook '${WEBHOOK_NAME}' -> ${created.url}`);
    return;
  }

  const isCurrent =
    found.url === desiredUrl && found.headers?.['x-revalidate-secret'] === desiredHeaders['x-revalidate-secret'];

  if (isCurrent) {
    strapi.log.info(`[isr] webhook '${WEBHOOK_NAME}' already registered.`);
    return;
  }

  const updated = await store.updateWebhook(found.id, {
    name: WEBHOOK_NAME,
    url: desiredUrl,
    headers: desiredHeaders,
    events: EVENTS,
    isEnabled: true,
  });

  runner.update(updated);

  // Never log the secret itself, only that something about the config drifted.
  strapi.log.info(`[isr] webhook '${WEBHOOK_NAME}' updated to ${updated.url}`);
}
