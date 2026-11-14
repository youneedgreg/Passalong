import { esc, renderPack } from './render';
import type { Pack } from './types';

/** Fill the built single-file player (dist/pack-template.html) with one worksheet. */
export function fillTemplate(template: string, pack: Pack): string {
  const parts: Record<string, string> = {
    LANG: esc(pack.lang),
    TITLE: `${esc(pack.title)} · Passalong`,
    HTML: renderPack(pack),
    // "<" is escaped so worksheet text can never close the script tag.
    JSON: JSON.stringify(pack.source).replace(/</g, '\\u003c'),
  };
  // One pass, so text a teacher typed is never scanned for placeholders.
  return template.replace(/%%PACK_(LANG|TITLE|HTML|JSON)%%/g, (_, name: string) => parts[name]);
}

export function fileName(pack: Pack): string {
  const slug = pack.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'worksheet'}-${pack.id}.html`;
}
