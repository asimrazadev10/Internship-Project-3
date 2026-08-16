import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getArticleBySlug, getArticles, strapiFetch } from '@/lib/strapi';

const json = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve({ data }) } as Response);

beforeEach(() => {
  process.env.STRAPI_URL = 'http://cms.test';
  process.env.REVALIDATE_WINDOW = '60';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('strapiFetch', () => {
  it('unwraps the data envelope and forwards tags and the revalidate window', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => json([{ id: 1 }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await strapiFetch<{ id: number }[]>('/api/things', { tags: ['things'] });

    expect(result).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://cms.test/api/things');
    expect((init as { next: unknown }).next).toEqual({ tags: ['things'], revalidate: 60 });
  });

  it('throws with the status and path when Strapi errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(null, false, 500)));

    await expect(strapiFetch('/api/things', { tags: [] })).rejects.toThrow(
      'Strapi responded 500 for /api/things',
    );
  });

  it('falls back to 60 when REVALIDATE_WINDOW is not a valid number', async () => {
    process.env.REVALIDATE_WINDOW = 'not-a-number';
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => json([]));
    vi.stubGlobal('fetch', fetchMock);

    await strapiFetch('/api/things', { tags: [] });

    const [, init] = fetchMock.mock.calls[0];
    expect((init as { next: { revalidate: number } }).next.revalidate).toBe(60);
  });
});

describe('queries', () => {
  it('tags an article detail query with only the slug tag', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      json([{ slug: 'a-post', title: 'A Post' }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const article = await getArticleBySlug('a-post');

    expect(article?.title).toBe('A Post');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('filters[slug][$eq]=a-post');
    // Only the slug tag. Adding the list tag here would mean an edit to any
    // article invalidates every other article's page.
    expect((init as { next: { tags: string[] } }).next.tags).toEqual(['article:a-post']);
  });

  it('returns null when no article matches the slug', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json([])));

    expect(await getArticleBySlug('missing')).toBeNull();
  });

  it('sorts the article list newest first', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => json([]));
    vi.stubGlobal('fetch', fetchMock);

    await getArticles();

    expect(fetchMock.mock.calls[0][0]).toContain('sort=publishedAt:desc');
  });
});
