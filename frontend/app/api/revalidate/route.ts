import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { ARTICLES_TAG, CATEGORIES_TAG, articleTag, categoryTag } from '@/lib/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WebhookBody = { model?: string; entry?: { slug?: string | null } | null };

/** Maps a Strapi model name to the cache tags an edit to it invalidates. */
export function tagsFor(model: string, slug?: string | null): string[] {
  switch (model) {
    case 'article':
      return slug ? [ARTICLES_TAG, articleTag(slug)] : [ARTICLES_TAG];
    case 'category':
      return slug ? [CATEGORIES_TAG, categoryTag(slug)] : [CATEGORIES_TAG];
    // A renamed author changes the byline shown on lists. Returning only
    // ARTICLES_TAG refreshes those immediately; it does not reach
    // /articles/[slug], which is tagged article:<slug> only, so a detail
    // page's byline heals within the REVALIDATE_WINDOW (60s) instead.
    case 'author':
      return [ARTICLES_TAG];
    default:
      return [];
  }
}

function secretMatches(provided: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET ?? '';
  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first. The
  // length of the secret is not itself sensitive.
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function POST(request: Request): Promise<Response> {
  // A missing secret and a wrong secret are indistinguishable to the caller.
  if (!secretMatches(request.headers.get('x-revalidate-secret'))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const body = (await request.json().catch(() => null)) as WebhookBody | null;
  const tags = body?.model ? tagsFor(body.model, body.entry?.slug) : [];

  // This endpoint only ever fires from a Strapi webhook, so the edit must be
  // live on the very next request rather than one request later. `'max'`
  // gives stale-while-revalidate semantics (still-stale until next visit);
  // `{ expire: 0 }` forces immediate expiration instead.
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }

  return json({ revalidated: tags });
}

export async function GET(): Promise<Response> {
  return json({ error: 'method not allowed' }, 405);
}
