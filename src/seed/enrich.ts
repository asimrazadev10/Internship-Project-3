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
 *
 * Because draft-and-publish is on, `publish()` promotes the entire current
 * draft, not just the fields this pass wrote. If an editor has unpublished
 * work-in-progress on an article, force-publishing it as a side effect of
 * seeding would be exactly the kind of overwrite this task is meant to
 * avoid. So before touching an article, its draft and published versions
 * are compared by `updatedAt`; a newer draft means unpublished changes
 * exist, and the article is left alone.
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

    // Guard against force-publishing an editor's unpublished work-in-progress.
    // Fetch the draft version and compare timestamps with the published
    // version already in hand: a strictly newer draft means there are
    // unpublished changes, and this pass must not touch the article at all.
    const draft = await strapi.documents('api::article.article').findOne({
      documentId: article.documentId,
      status: 'draft',
    });

    if (draft && new Date(draft.updatedAt as string) > new Date(article.updatedAt as string)) {
      strapi.log.info(`[seed] Skipped '${article.slug}': it has unpublished draft changes`);
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
