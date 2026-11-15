export function formatTags(tags?: Record<string, string>) {
  if (tags == null) {
    return undefined;
  }
  return Object.entries(tags).map(([key, value]) => ({ key, value }));
}
