// src/lib/tag-canonicalize.ts
// Canonicalize tags at write time so 'Pricing Strategy' and 'pricing-strategy' coalesce.
// Used by repo.writeClaim() before insert.

export function canonicalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // anything non-alphanumeric → dash
    .replace(/^-+|-+$/g, '') // strip leading/trailing dashes
    .replace(/-+/g, '-'); // collapse multiple dashes
}
