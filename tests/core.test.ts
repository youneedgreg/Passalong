import { describe, expect, it } from 'vitest';
import { charLength, crc8, decodeCode, encodeCode, extractCodes, tidyCode } from '../src/core/code';
import { attemptIsRight, score, shortIsRight, summarise } from '../src/core/grade';
import { canonical, fnv1a, packCheck, packId } from '../src/core/hash';
import { decodeLink, encodeLink } from '../src/core/link';
import { parseWorksheet } from '../src/core/parse';
import { fileName, fillTemplate } from '../src/core/file';
import { renderPack } from '../src/core/render';
import { SAMPLE } from '../src/core/sample';
import type { Attempt, ShortQuestion } from '../src/core/types';

const parsed = parseWorksheet(SAMPLE);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
const pack = parsed.pack;

describe('hash', () => {
  it('matches the published FNV-1a vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
  it('ignores line endings and trailing spaces', () => {
    const windows = SAMPLE.replace(/\n/g, '\r\n').replace(/Title: /, 'Title: ') + '   \n\n';
    expect(canonical(windows)).toBe(canonical(SAMPLE));
    expect(packCheck(canonical(windows))).toBe(pack.check);
  });
  it('gives the sample a stable ID', () => {
    console.log('SAMPLE check', pack.check, 'id', pack.id, 'hash', fnv1a(pack.source).toString(16));
    expect(packId(pack.source)).toBe(pack.id);
    expect(pack.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
  });
});

describe('parse', () => {
  it('reads the sample', () => {
    expect(pack.title).toBe('Adding fractions with different denominators');
    expect(pack.level).toBe('Grade 7');
    expect(pack.questions).toHaveLength(6);
    expect(pack.questions[0].kind).toBe('choice');
    expect(pack.questions[2]).toMatchObject({ kind: 'short', accepted: ['7/8'] });
    const q1 = pack.questions[0];
    if (q1.kind !== 'choice') throw new Error('q1');
    expect(q1.options[1].feedback).toMatch(/^You added the tops/);
    expect(q1.options[0].feedback).toBeUndefined();
  });
  it('reports problems with line numbers', () => {
    const bad = parseWorksheet('Q: No title here\n- a\n- b\n\nQ: Mixed\n* a\n- b\n= c\n\nQ: Empty');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    const text = bad.errors.map((e) => `${e.line}: ${e.message}`).join('\n');
    expect(text).toMatch(/1: Add a first line/);
    expect(text).toMatch(/1: Mark exactly one option/);
    expect(text).toMatch(/5: Use options/);
    expect(text).toMatch(/10: This question has no answers/);
  });
  it('joins continuation lines', () => {
    const r = parseWorksheet('Title: T\nQ: First line\nsecond line\n* yes\n- no');
    expect(r.ok && r.pack.questions[0].prompt).toBe('First line second line');
  });
});

describe('answer code', () => {
  const attempts: Attempt[] = [
    { answer: 2, hint: false },
    { answer: 2, hint: false },
    { answer: 1, hint: true },
    { answer: 2, hint: false },
    { answer: 2, hint: true },
    { answer: 0, hint: false },
  ];
  it('has the published CRC-8 check value', () => {
    expect(crc8(new TextEncoder().encode('123456789'))).toBe(0xf4);
  });
  it('round-trips', () => {
    const code = encodeCode(pack.check, 17, attempts);
    console.log('SAMPLE code', code, 'chars', tidyCode(code).length);
    expect(tidyCode(code)).toHaveLength(charLength(6));
    expect(decodeCode(code, pack.check, 6)).toEqual({ ok: true, learner: 17, attempts });
  });
  it('survives how people retype it', () => {
    const code = encodeCode(pack.check, 17, attempts);
    const messy = ' ' + code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l') + ' ';
    expect(decodeCode(messy, pack.check, 6)).toEqual({ ok: true, learner: 17, attempts });
  });
  it('rejects damage and the wrong worksheet', () => {
    const code = encodeCode(pack.check, 17, attempts);
    const plain = tidyCode(code);
    const flipped = (plain[0] === '7' ? '8' : '7') + plain.slice(1);
    expect(decodeCode(flipped, pack.check, 6)).toMatchObject({ ok: false });
    expect(decodeCode(plain.slice(1), pack.check, 6)).toEqual({ ok: false, reason: 'length' });
    expect(decodeCode(code, (pack.check + 1) & 0xfff, 6)).toEqual({ ok: false, reason: 'worksheet' });
  });
  it('catches every single-character typo', () => {
    const plain = tidyCode(encodeCode(pack.check, 17, attempts));
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let missed = 0;
    for (let i = 0; i < plain.length; i++) {
      for (const ch of alphabet) {
        if (ch === plain[i]) continue;
        const r = decodeCode(plain.slice(0, i) + ch + plain.slice(i + 1), pack.check, 6);
        if (r.ok) missed++;
      }
    }
    console.log('single-char typos accepted:', missed);
    expect(missed).toBe(0);
  });
  it('handles 1 and 20 questions', () => {
    for (const n of [1, 2, 19, 20]) {
      const many = Array.from({ length: n }, (_, i) => ({ answer: i % 7, hint: i % 3 === 0 }));
      const code = encodeCode(0xabc, 99, many);
      expect(decodeCode(code, 0xabc, n)).toEqual({ ok: true, learner: 99, attempts: many });
    }
    console.log('code length for 10 questions', charLength(10), 'for 20', charLength(20));
  });
  it('finds codes in pasted messages', () => {
    const code = encodeCode(pack.check, 17, attempts);
    expect(extractCodes(`PASSALONG ${code}\nMy answers: ${code} thanks\n\npassalong ${tidyCode(code)}`)).toEqual([code, code, tidyCode(code)]);
  });
});

describe('grading', () => {
  it('marks first attempts', () => {
    const all: Attempt[] = [1, 2, 1, 2, 1, 3].map((answer) => ({ answer, hint: false }));
    expect(score(pack, all)).toBe(6);
    expect(attemptIsRight(pack.questions[0], { answer: 2, hint: false })).toBe(false);
    expect(attemptIsRight(pack.questions[0], { answer: 0, hint: false })).toBe(false);
  });
  it('accepts typed answers written differently', () => {
    const q = pack.questions[2] as ShortQuestion;
    expect(shortIsRight(q, ' 7 / 8 ')).toBe(true);
    expect(shortIsRight(q, '8/7')).toBe(false);
    expect(shortIsRight(q, '')).toBe(false);
    const decimal: ShortQuestion = { kind: 'short', prompt: '', accepted: ['0.75'] };
    expect(shortIsRight(decimal, '.75')).toBe(true);
    expect(shortIsRight(decimal, '0.750')).toBe(true);
  });
  it('sorts the class view by most missed', () => {
    const a: Attempt[] = [1, 2, 1, 2, 1, 3].map((answer) => ({ answer, hint: false }));
    const b: Attempt[] = [2, 2, 1, 1, 1, 3].map((answer) => ({ answer, hint: true }));
    const rows = summarise(pack, [a, b]);
    expect(rows[0]).toMatchObject({ index: 0, right: 1, hints: 1 });
    expect(rows[0].picks[2]).toBe(1);
    expect(rows[1].index).toBe(3);
  });
});

describe('link', () => {
  it('round-trips the sample', () => {
    const fragment = encodeLink(SAMPLE);
    console.log('SAMPLE source bytes', new TextEncoder().encode(pack.source).length, 'link chars', fragment.length);
    expect(decodeLink('#' + fragment)).toBe(pack.source);
    expect(fragment).toMatch(/^1[A-Za-z0-9_-]+$/);
  });
  it('returns null for rubbish', () => {
    expect(decodeLink('#hello')).toBeNull();
    expect(decodeLink('#1!!!!')).toBeNull();
    expect(decodeLink('')).toBeNull();
  });
});

describe('render', () => {
  it('escapes and labels', () => {
    const r = parseWorksheet('Title: <b>T</b>\nQ: Is 2 < 3?\n* yes\n- no');
    if (!r.ok) throw new Error('parse');
    const html = renderPack(r.pack);
    expect(html).toContain('&lt;b&gt;T&lt;/b&gt;');
    expect(html).toContain('Is 2 &lt; 3?');
    expect(html).toContain('<legend>');
    expect(html).toContain('<noscript>');
  });
});

describe('single file', () => {
  const template = '<html lang="%%PACK_LANG%%"><title>%%PACK_TITLE%%</title><main>%%PACK_HTML%%</main><script type="application/json" id="pack-data">%%PACK_JSON%%</script></html>';
  it('fills every placeholder once', () => {
    const html = fillTemplate(template, pack);
    expect(html).not.toMatch(/%%PACK_/);
    expect(html).toContain('<html lang="en">');
    const json = /id="pack-data">(.*)<\/script>/s.exec(html)![1];
    expect(JSON.parse(json)).toBe(pack.source);
  });
  it('cannot be broken by worksheet text', () => {
    const r = parseWorksheet('Title: </script><script>alert(1)</script> %%PACK_JSON%%\nQ: $& $1 %%PACK_HTML%%?\n* yes\n- no');
    if (!r.ok) throw new Error('parse');
    const html = fillTemplate(template, r.pack);
    expect(html.match(/<script/g)).toHaveLength(1);
    const json = /id="pack-data">(.*)<\/script>/s.exec(html)![1];
    expect(JSON.parse(json)).toBe(r.pack.source);
  });
  it('names the file', () => {
    expect(fileName(pack)).toBe(`adding-fractions-with-different-denomina-${pack.id}.html`);
  });
});
