import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { canonical } from './hash';

/** Link payload version. "1" = raw-deflate, then base64url. */
const VERSION = '1';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Worksheet text to the part of the link after "#". */
export function encodeLink(source: string): string {
  return VERSION + toBase64Url(deflateSync(strToU8(canonical(source)), { level: 9 }));
}

/** The part after "#" back to worksheet text, or null when it is not a pack. */
export function decodeLink(fragment: string): string | null {
  const text = fragment.replace(/^#/, '');
  if (!text.startsWith(VERSION)) return null;
  try {
    return strFromU8(inflateSync(fromBase64Url(text.slice(1))));
  } catch {
    return null;
  }
}
