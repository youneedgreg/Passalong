import { ALPHABET } from './hash';
import type { Attempt } from './types';

export const CODE_VERSION = 0;

export type DecodeResult =
  | { ok: true; learner: number; attempts: Attempt[] }
  | { ok: false; reason: 'length' | 'checksum' | 'version' | 'worksheet' };

/** CRC-8, polynomial 0x07, start value 0x00. */
export function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

export function byteLength(questionCount: number): number {
  return 3 + Math.ceil(questionCount / 2) + 1;
}

export function charLength(questionCount: number): number {
  return Math.ceil((byteLength(questionCount) * 8) / 5);
}

function toBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let at = 0;
  for (const ch of text) {
    buffer = (buffer << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8 && at < length) {
      out[at++] = (buffer >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  return out;
}

/** Upper-case, fix look-alike letters, drop hyphens, spaces and anything else. */
export function tidyCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .split('')
    .filter((ch) => ALPHABET.includes(ch))
    .join('');
}

export function groupCode(plain: string): string {
  return plain.match(/.{1,4}/g)?.join('-') ?? '';
}

export function encodeCode(check: number, learner: number, attempts: Attempt[]): string {
  const bytes = new Uint8Array(byteLength(attempts.length));
  bytes[0] = (CODE_VERSION << 4) | ((check >>> 8) & 0x0f);
  bytes[1] = check & 0xff;
  bytes[2] = Math.max(0, Math.min(99, learner | 0));
  attempts.forEach((a, i) => {
    const nibble = ((a.hint ? 1 : 0) << 3) | (a.answer & 0x07);
    bytes[3 + (i >> 1)] |= i % 2 === 0 ? nibble << 4 : nibble;
  });
  bytes[bytes.length - 1] = crc8(bytes.subarray(0, bytes.length - 1));
  return groupCode(toBase32(bytes));
}

export function decodeCode(text: string, check: number, questionCount: number): DecodeResult {
  const plain = tidyCode(text);
  if (plain.length !== charLength(questionCount)) return { ok: false, reason: 'length' };
  const bytes = fromBase32(plain, byteLength(questionCount));
  // Re-encoding must give the same text, so stray padding bits count as damage.
  if (toBase32(bytes) !== plain) return { ok: false, reason: 'checksum' };
  if (crc8(bytes.subarray(0, bytes.length - 1)) !== bytes[bytes.length - 1]) return { ok: false, reason: 'checksum' };
  if (bytes[0] >>> 4 !== CODE_VERSION) return { ok: false, reason: 'version' };
  if ((((bytes[0] & 0x0f) << 8) | bytes[1]) !== check) return { ok: false, reason: 'worksheet' };
  const attempts: Attempt[] = [];
  for (let i = 0; i < questionCount; i++) {
    const byte = bytes[3 + (i >> 1)];
    const nibble = i % 2 === 0 ? byte >>> 4 : byte & 0x0f;
    attempts.push({ answer: nibble & 0x07, hint: (nibble & 0x08) !== 0 });
  }
  return { ok: true, learner: bytes[2], attempts };
}

/** Pull codes out of pasted text messages, one candidate per line. */
export function extractCodes(pasted: string): string[] {
  const found: string[] = [];
  for (const line of pasted.split(/\r?\n/)) {
    const grouped = line.match(/[0-9A-Za-z]{4}(?:-[0-9A-Za-z]{1,4})+/g);
    if (grouped) {
      found.push(...grouped);
      continue;
    }
    const rest = line.replace(/passalong/gi, '').trim();
    if (rest) found.push(rest);
  }
  return found;
}
