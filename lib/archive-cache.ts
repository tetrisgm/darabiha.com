import type { SiteVisibility } from "../db/store";

/**
 * Only the genuinely public archive may enter shared caches. Password and
 * member access are both cookie-bound and must stop at the visitor's browser.
 */
export function archiveCacheHeaders(
  visibility: SiteVisibility,
  publicCacheControl: string,
): Record<string, string> {
  if (visibility === "public") return { "cache-control": publicCacheControl };
  return privateArchiveCacheHeaders();
}

export function privateArchiveCacheHeaders(): Record<string, string> {
  return {
    "cache-control": "private, no-store, max-age=0",
    vary: "Cookie",
  };
}

/** Preserve an authorization response while ensuring intermediaries cannot
 * reuse it for a different visitor. */
export function preventSharedCaching(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateArchiveCacheHeaders())) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
