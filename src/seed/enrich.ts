import type { Core } from '@strapi/strapi';
import { ARTICLE_ENRICHMENT, DEMO_BODY, DEMO_BODY_SLUG } from './data';

/**
 * Fills the fields added by the content-modelling work on articles that predate
 * them.
 *
 * `seedBlog` returns early whenever any article exists, so on a database that
 * already has content none of the new modelling would ever appear — including
 * on the machine doing the development. This pass closes that gap.
 *
 * It only ever writes into a field that is currently empty, so it never
 * overwrites an editor's work and running it twice changes nothing.
 */
export async function enrichExistingArticles(strapi: Core.Strapi): Promise<void> {
  const articles = await strapi.documents('api::article.article').findMany({
    populate: { body: true, seo: true },
    status: 'published',
  });

  if (articles.length === 0) {
    return;
  }

  const someArticleIsFeatured = articles.some((article) => article.featured === true);

  for (const article of articles) {
    const enrichment = article.slug ? ARTICLE_ENRICHMENT[article.slug] : undefined;
    const data: Record<string, unknown> = {};

    // The demo article gets the four-block body, but only if an editor has not
    // already written one.
    if (article.slug === DEMO_BODY_SLUG && (article.body ?? []).length === 0) {
      data.body = DEMO_BODY;
    }

    if (enrichment?.kicker && !article.kicker) {
      data.kicker = enrichment.kicker;
    }

    if (enrichment?.seo && !article.seo) {
      data.seo = enrichment.seo;
    }

    // Only promote a featured article when nothing is featured yet, so an
    // editor's choice of hero survives a restart.
    if (enrichment?.featured && !someArticleIsFeatured) {
      data.featured = true;
    }

    if (Object.keys(data).length === 0) {
      continue;
    }

    // Articles have draft-and-publish on, so an update writes the draft. The
    // public API serves published entries, so the change has to be published
    // too or the enrichment is invisible to the frontend and to the
    // verification script.
    await strapi.documents('api::article.article').update({
      documentId: article.documentId,
      data,
    });

    await strapi.documents('api::article.article').publish({
      documentId: article.documentId,
    });

    strapi.log.info(`[seed] Enriched '${article.slug}': ${Object.keys(data).join(', ')}`);
  }
}
