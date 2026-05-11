export function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8).toLowerCase();
}
