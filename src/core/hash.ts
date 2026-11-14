export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/** Same text in, same text out, on every device. Hash and share only this form. */
export function canonical(source: string): string {
  return source
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

/** FNV-1a, 32-bit, over UTF-8 bytes. */
export function fnv1a(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 12-bit check carried inside each answer code. */
export function packCheck(canonicalSource: string): number {
  return fnv1a(canonicalSource) & 0xfff;
}

/** 4-character worksheet ID for people (top 20 bits of the hash). */
export function packId(canonicalSource: string): string {
  const top = fnv1a(canonicalSource) >>> 12;
  let out = '';
  for (let shift = 15; shift >= 0; shift -= 5) out += ALPHABET[(top >>> shift) & 31];
  return out;
}
