import type { Core } from '@strapi/strapi';
import { ARTICLES, AUTHORS, CATEGORIES, PUBLIC_READ_ACTIONS } from './data';

/**
 * Creates sample authors, categories, and published articles.
 * Idempotent: returns immediately if any article already exists.
 */
export async function seedBlog(strapi: Core.Strapi): Promise<void> {
  const existing = await strapi.documents('api::article.article').count({});

  if (existing > 0) {
    strapi.log.info(`[seed] ${existing} article(s) already present, skipping seed.`);
    return;
  }

  const authorIdsByEmail = new Map<string, string>();

  for (const author of AUTHORS) {
    const created = await strapi.documents('api::author.author').create({
      data: author,
    });
    authorIdsByEmail.set(author.email, created.documentId);
  }

  const categoryIdsByName = new Map<string, string>();

  for (const category of CATEGORIES) {
    const created = await strapi.documents('api::category.category').create({
      data: category,
    });
    categoryIdsByName.set(category.name, created.documentId);
  }

  for (const article of ARTICLES) {
    const { authorEmail, categoryNames, ...fields } = article;

    // Resolve relations up front so a typo in data.ts fails loudly here
    // rather than silently creating an article with no author.
    const authorId = authorIdsByEmail.get(authorEmail);

    if (!authorId) {
      throw new Error(`[seed] No seeded author with email "${authorEmail}".`);
    }

    const categoryIds = categoryNames.map((name) => {
      const id = categoryIdsByName.get(name);

      if (!id) {
        throw new Error(`[seed] No seeded category named "${name}".`);
      }

      return id;
    });

    await strapi.documents('api::article.article').create({
      data: {
        ...fields,
        author: authorId,
        categories: categoryIds,
      },
      // Without this the entries are drafts and GET /api/articles returns [].
      status: 'published',
    });
  }

  strapi.log.info(
    `[seed] Created ${AUTHORS.length} authors, ${CATEGORIES.length} categories, ${ARTICLES.length} articles.`
  );
}

/**
 * Grants the Public role find/findOne on the blog content types.
 * Idempotent: only creates permission rows that are missing.
 */
export async function grantPublicReadAccess(strapi: Core.Strapi): Promise<void> {
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) {
    strapi.log.warn('[seed] Public role not found, skipping permission grant.');
    return;
  }

  for (const action of PUBLIC_READ_ACTIONS) {
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({ where: { action, role: publicRole.id } });

    if (existing) {
      continue;
    }

    await strapi.db.query('plugin::users-permissions.permission').create({
      data: { action, role: publicRole.id },
    });

    strapi.log.info(`[seed] Granted public access: ${action}`);
  }
}
