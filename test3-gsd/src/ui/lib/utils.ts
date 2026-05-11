// src/ui/lib/utils.ts
// shadcn-canonical `cn` helper — merges Tailwind class strings with
// conflict resolution. Reproduced manually because the assistant-ui
// init CLI was unavailable at execution time (sandbox blocked node
// invocations); the file is byte-identical to the shadcn template.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
