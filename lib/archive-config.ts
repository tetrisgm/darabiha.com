/** Per-deployment identity. Every family that deploys this platform names
 * its own archive here instead of inheriting the reference instance's; the
 * values come from Worker vars so one wrangler config carries them all.
 * Server-side only - client components get their strings through i18n. */

export function publicOrigin(): string {
  return (process.env.PUBLIC_ORIGIN || "https://example.com").replace(/\/+$/, "");
}

export function archiveName(): string {
  return (process.env.ARCHIVE_NAME || "").trim() || "Family Archive";
}

/** The origin's host, for identities that must align with the sending
 * domain (SMTP EHLO, Message-ID) or name the deployment (GEDCOM source). */
export function archiveDomain(): string {
  try {
    return new URL(publicOrigin()).hostname;
  } catch {
    return "example.com";
  }
}

/** A filename- and GEDCOM-safe slug of the archive's name. */
export function archiveSlug(): string {
  const slug = archiveName().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "family-archive";
}
