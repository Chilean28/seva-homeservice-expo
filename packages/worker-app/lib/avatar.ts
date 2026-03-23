/** First letter(s) of name, up to 2 chars, uppercase. Empty name → "?". */
export function getInitials(name: string | null | undefined): string {
  if (name == null || !String(name).trim()) return '?';
  return String(name)
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
