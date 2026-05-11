// src/onebrain/ids.ts
// ULID generator. Wrapped so we can swap libs without touching call sites.
// App-side generation (no DB round-trip); lexicographically sortable.

import { ulid as _ulid } from 'ulid';

export function ulid(): string {
  return _ulid();
}
