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
  return {
    "cache-control": "private, no-store, max-age=0",
    vary: "Cookie",
  };
}
