import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (tag: string, profile: string) => revalidateTag(tag, profile),
}));

import { GET, POST, tagsFor } from '@/app/api/revalidate/route';

const post = (body: unknown, secret?: string) =>
  POST(
    new Request('http://localhost:3000/api/revalidate', {
      method: 'POST',
      headers: secret ? { 'x-revalidate-secret': secret } : {},
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  process.env.REVALIDATE_SECRET = 'test-secret';
  revalidateTag.mockClear();
});

describe('tagsFor', () => {
  it('maps each model to its tags', () => {
    expect(tagsFor('article', 'a-post')).toEqual(['articles', 'article:a-post']);
    expect(tagsFor('category', 'engineering')).toEqual(['categories', 'category:engineering']);
    expect(tagsFor('author', null)).toEqual(['articles']);
    expect(tagsFor('unknown-model', 'x')).toEqual([]);
  });

  it('falls back to the list tag when an entry has no slug', () => {
    expect(tagsFor('article', undefined)).toEqual(['articles']);
  });
});

describe('POST /api/revalidate', () => {
  it('rejects a missing secret without revalidating', async () => {
    const response = await post({ model: 'article', entry: { slug: 'a-post' } });

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret of a different length', async () => {
    const response = await post({ model: 'article' }, 'nope');

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('revalidates the mapped tags for a valid request', async () => {
    const response = await post({ model: 'article', entry: { slug: 'a-post' } }, 'test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ['articles', 'article:a-post'] });
    expect(revalidateTag).toHaveBeenCalledWith('articles', 'max');
    expect(revalidateTag).toHaveBeenCalledWith('article:a-post', 'max');
  });

  it('accepts an unknown model and revalidates nothing', async () => {
    const response = await post({ model: 'plugin::upload.file' }, 'test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: [] });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('refuses GET', async () => {
    expect((await GET()).status).toBe(405);
  });
});
