import type { Core } from '@strapi/strapi';
import { ensureEventLedgerIndex } from './api/stripe-webhook/services/ledger-index';
import {
  enrichExistingArticles,
  grantPublicReadAccess,
  registerIsrWebhook,
  seedBlog,
  seedMedia,
  seedSiteSettings,
} from './seed';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * Seeds sample blog content on first run and makes it publicly readable.
   * Both calls are idempotent, so restarts are harmless.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // First, because webhook de-duplication is only a guarantee once this
    // index exists — Strapi's `unique: true` alone does not create one.
    await ensureEventLedgerIndex(strapi);

    await seedBlog(strapi);
    await seedMedia(strapi);
    await enrichExistingArticles(strapi);
    await seedSiteSettings(strapi);
    await grantPublicReadAccess(strapi);
    await registerIsrWebhook(strapi);
  },
};
