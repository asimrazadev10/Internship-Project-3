import { parseStrapiUrl } from '@/lib/strapi-url';
import type { StrapiImage } from '@/lib/types';

// `URL#origin` never carries a trailing slash (even when STRAPI_URL does),
// so joining it to a `/uploads/…` path can never produce a double slash.
const baseUrl = () => parseStrapiUrl(process.env.STRAPI_URL ?? 'http://localhost:1337').origin;

/**
 * Resolves a Strapi media URL, optionally picking a generated derivative.
 *
 * The local upload provider returns RELATIVE paths (`/uploads/…`), which would
 * resolve against the Next server rather than Strapi. Absolute URLs — what a
 * remote provider returns — pass through untouched, so swapping providers needs
 * no change here.
 */
export function imageUrl(
  media: StrapiImage | null | undefined,
  format?: string,
): string | null {
  if (!media) {
    return null;
  }

  const chosen = (format && media.formats?.[format]?.url) || media.url;

  return /^https?:\/\//.test(chosen) ? chosen : `${baseUrl()}${chosen}`;
}

/** An `alt` attribute is never empty: falls back to the caller's text. */
export function imageAlt(media: StrapiImage | null | undefined, fallback: string): string {
  return media?.alternativeText || fallback;
}
