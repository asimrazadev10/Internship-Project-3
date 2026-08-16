import { describe, expect, it } from 'vitest';
import { pickHero } from '@/lib/hero';
import type { Article } from '@/lib/types';

const article = (slug: string, featured = false): Article =>
  ({ slug, featured, title: slug }) as Article;

describe('pickHero', () => {
  it('prefers the featured article over the first', () => {
    const { hero, rest } = pickHero([article('a'), article('b', true), article('c')]);

    expect(hero?.slug).toBe('b');
    expect(rest.map((a) => a.slug)).toEqual(['a', 'c']);
  });

  it('falls back to the first article when none is featured', () => {
    const { hero, rest } = pickHero([article('a'), article('b')]);

    expect(hero?.slug).toBe('a');
    expect(rest.map((a) => a.slug)).toEqual(['b']);
  });

  it('handles an empty list', () => {
    expect(pickHero([])).toEqual({ hero: null, rest: [] });
  });
});
