/**
 * Parses `STRAPI_URL` once, so `next.config.ts` (remotePatterns) and
 * `lib/media.ts` (imageUrl) derive their behaviour from the same URL object
 * instead of drifting apart under separate parsing rules.
 *
 * Throws with a clear message on a malformed `STRAPI_URL` rather than letting
 * `next.config.ts` silently produce a broken images config.
 */
export function parseStrapiUrl(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new Error(
      `STRAPI_URL is not a valid URL: "${raw}". Set it to something like ` +
        `"http://localhost:1337" or "https://cms.example.com".`,
    );
  }
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * True only when the parsed `hostname` itself is loopback — never a regex on
 * the raw string. A string-regex gate on the raw URL lets something like
 * `http://localhost:pw@evil.com/` through, because `localhost` appears right
 * after the scheme even though the URL actually resolves to `evil.com`
 * (`localhost:pw` is userinfo, not the host). Testing `url.hostname`, which
 * the URL parser has already resolved, closes that hole.
 */
export function isLoopbackUrl(url: URL): boolean {
  return LOOPBACK_HOSTNAMES.has(url.hostname);
}
