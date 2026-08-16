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
}

/**
 * Points Strapi at the Next.js revalidation endpoint.
 *
 * Idempotent: looks the webhook up by name and creates it only when absent, so
 * restarts are harmless and a fresh database needs no trip through the admin UI.
 */
export async function registerIsrWebhook(strapi: Core.Strapi): Promise<void> {
  const store = strapi.get('webhookStore') as WebhookStore;
  const existing = (await store.findWebhooks()) ?? [];

  if (existing.some((webhook) => webhook.name === WEBHOOK_NAME)) {
    strapi.log.info(`[isr] webhook '${WEBHOOK_NAME}' already registered.`);
    return;
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const created = await store.createWebhook({
    name: WEBHOOK_NAME,
    url: `${frontendUrl}/api/revalidate`,
    headers: { 'x-revalidate-secret': process.env.REVALIDATE_SECRET ?? 'dev-secret-change-me' },
    events: EVENTS,
    isEnabled: true,
  });

  // The core provider loads webhooks into the runner during its own bootstrap,
  // which has already happened by the time this runs. Registering the new
  // webhook directly makes it live now rather than after the next restart.
  (strapi.get('webhookRunner') as { add(webhook: StoredWebhook): void }).add(created);

  strapi.log.info(`[isr] registered webhook '${WEBHOOK_NAME}' -> ${created.url}`);
}
