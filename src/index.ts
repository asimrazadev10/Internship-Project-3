import type { Core } from '@strapi/strapi';
import { grantPublicReadAccess, seedBlog } from './seed';

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
    await seedBlog(strapi);
    await grantPublicReadAccess(strapi);
  },
};
