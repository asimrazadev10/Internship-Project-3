import type { Core } from '@strapi/strapi';
import { SITE_SETTINGS } from './data';

/**
 * Creates the Site Settings single type if it has no entry yet.
 *
 * Idempotent: a single type has at most one entry, so an existing one is left
 * alone rather than overwritten — an editor's copy changes must survive a
 * restart.
 */
export async function seedSiteSettings(strapi: Core.Strapi): Promise<void> {
  const existing = await strapi.documents('api::site-setting.site-setting').findFirst({});

  if (existing) {
    strapi.log.info('[seed] Site settings already present, leaving them alone.');
    return;
  }

  await strapi.documents('api::site-setting.site-setting').create({
    data: SITE_SETTINGS,
  });

  strapi.log.info('[seed] Created site settings.');
}
