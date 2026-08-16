import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { imageAlt, imageUrl } from '@/lib/media';
import type { StrapiImage } from '@/lib/types';

const image = (overrides: Partial<StrapiImage> = {}): StrapiImage => ({
  id: 1,
  url: '/uploads/cover_abc.jpg',
  alternativeText: 'A cover',
  width: 1600,
  height: 900,
  formats: {
    thumbnail: { url: '/uploads/thumbnail_cover_abc.jpg', width: 245, height: 138 },
    small: { url: '/uploads/small_cover_abc.jpg', width: 500, height: 281 },
  },
  ...overrides,
});

beforeEach(() => {
  process.env.STRAPI_URL = 'http://cms.test';
});

afterEach(() => {
  delete process.env.STRAPI_URL;
});

describe('imageUrl', () => {
  it('resolves a relative upload path against STRAPI_URL', () => {
    // The local provider returns relative paths, which would otherwise resolve
    // against the Next server and 404.
    expect(imageUrl(image())).toBe('http://cms.test/uploads/cover_abc.jpg');
  });

  it('returns the requested derivative when it exists', () => {
    expect(imageUrl(image(), 'small')).toBe('http://cms.test/uploads/small_cover_abc.jpg');
  });

  it('falls back to the original when the derivative is missing', () => {
    expect(imageUrl(image(), 'enormous')).toBe('http://cms.test/uploads/cover_abc.jpg');
  });

  it('falls back to the original when there are no formats at all', () => {
    expect(imageUrl(image({ formats: null }), 'small')).toBe('http://cms.test/uploads/cover_abc.jpg');
  });

  it('does not double a trailing slash on STRAPI_URL', () => {
    process.env.STRAPI_URL = 'http://cms.test/';
    expect(imageUrl(image())).toBe('http://cms.test/uploads/cover_abc.jpg');
  });

  it('passes an already-absolute URL through untouched', () => {
    // A remote provider (S3, Cloudinary) returns absolute URLs; switching to
    // one must need no change here.
    const remote = image({ url: 'https://cdn.example.com/cover.jpg', formats: null });
    expect(imageUrl(remote)).toBe('https://cdn.example.com/cover.jpg');
  });

  it('returns null for absent media', () => {
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl(undefined)).toBeNull();
  });
});

describe('imageAlt', () => {
  it('prefers the media alternativeText', () => {
    expect(imageAlt(image(), 'Fallback')).toBe('A cover');
  });

  it('falls back when alternativeText is null or empty', () => {
    expect(imageAlt(image({ alternativeText: null }), 'Fallback')).toBe('Fallback');
    expect(imageAlt(image({ alternativeText: '' }), 'Fallback')).toBe('Fallback');
  });

  it('falls back for absent media', () => {
    expect(imageAlt(null, 'Fallback')).toBe('Fallback');
  });
});
