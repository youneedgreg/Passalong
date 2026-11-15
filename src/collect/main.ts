import '../shared/base.css';
import './collect.css';
import { decodeCode, extractCodes, tidyCode } from '../core/code';
import { fileName } from '../core/file';
import { attemptIsRight, score, summarise } from '../core/grade';
import { decodeLink } from '../core/link';
import { parseWorksheet } from '../core/parse';
import { SAMPLE } from '../core/sample';
import type { Attempt, Pack } from '../core/types';
import { registerSW } from '../shared/sw-register';
import { sampleCodes } from './sample-codes';

const STORE = 'passalong:packs';
const LETTERS = 'ABCDEF';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = $<HTMLSelectElement>('pack');
const packEmpty = $('pack-empty');
const linkInput = $<HTMLInputElement>('link');
const packStatus = $('pack-status');
const codesBox = $<HTMLTextAreaElement>('codes');
const result = $('result');
const results = $('results');
const problemsHeading = $('problems-h');
const problems = $<HTMLOListElement>('problems');
const questionsBody = $<HTMLTableElement>('questions').tBodies[0];
const learnersTable = $<HTMLTableElement>('learners');
const repeats = $('repeats');
const csvNote = $('csv-note');

type Saved = { id: string; title: string; source: string; made: number };
type Good = { line: number; learner: number; attempts: Attempt[] };
type Bad = { line: number; reason: 'checksum' | 'version' | 'worksheet' | 'length' };

/** Worksheets this page knows, by ID: saved by Make, pasted as a link, or the sample. */
const known = new Map<string, Pack>();
let current: Pack | null = null;
let rows: Good[] = [];

/** Only touch a live region when its words change, so a screen reader is not told the same thing twice. */
function say(el: HTMLElement, text: string, cls = ''): void {
  if (el.textContent !== text) el.textContent = text;
  el.className = el.className.replace(/\b(ok|bad)\b/g, '').trim() + (cls ? ` ${cls}` : '');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function addOption(pack: Pack, label: string): void {
  known.set(pack.id, pack);
  for (const o of [...picker.options]) if (o.value === '') o.remove(); // the "No saved worksheets" placeholder
  if (![...picker.options].some((o) => o.value === pack.id)) picker.append(new Option(label, pack.id));
  picker.disabled = false;
  packEmpty.hidden = true;
}

function choose(id: string): void {
  picker.value = id;
  current = known.get(id) ?? null;
  if (current) {
    const n = current.questions.length;
    say(packStatus, `Worksheet ${current.id}: ${current.title}, ${n} ${n === 1 ? 'question' : 'questions'}.`, 'ok');
  }
  // Codes already read belong to the old choice; read them again against this one.
  if (!results.hidden) readCodes();
}

// 1. The worksheets Make saved on this device.
function loadPacks(): void {
  let saved: Saved[] = [];
  try {
    const raw = localStorage.getItem(STORE);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) saved = list;
  } catch {
    /* no storage here: the link still works */
  }
  for (const s of saved) {
    const parsed = s && typeof s.source === 'string' ? parseWorksheet(s.source) : null;
    if (parsed?.ok) addOption(parsed.pack, `${parsed.pack.title} (${parsed.pack.id})`);
  }
  if (known.size) choose(picker.options[0].value);
  else {
    picker.append(new Option('No saved worksheets', ''));
    picker.disabled = true;
    packEmpty.hidden = false;
  }
}

// 2. A pasted worksheet link: the part after "#" holds the whole worksheet.
function packFromLink(value: string): Pack | null {
  try {
    const source = decodeLink(new URL(value.trim()).hash);
    if (source === null) return null;
    const parsed = parseWorksheet(source);
    return parsed.ok ? parsed.pack : null;
  } catch {
    return null;
  }
}

function onLink(): void {
  const value = linkInput.value.trim();
  if (!value) return;
  const pack = packFromLink(value);
  if (!pack) {
    say(packStatus, 'This is not a Passalong worksheet link. Copy it again from Make.', 'bad');
    return;
  }
  addOption(pack, `${pack.title} (${pack.id}), from the link`);
  choose(pack.id);
}

// 3. Read every line: good codes and bad lines apart, each with its line number. Exact repeats are dropped.
function readCodes(): void {
  if (!current) {
    say(result, 'Choose a worksheet first, or paste its link.', 'bad');
    picker.disabled ? linkInput.focus() : picker.focus();
    return;
  }
  const pack = current;
  const seen = new Set<string>();
  const good: Good[] = [];
  const bad: Bad[] = [];
  let dropped = 0;
  codesBox.value.split(/\r?\n/).forEach((text, i) => {
    for (const code of extractCodes(text)) {
      const plain = tidyCode(code);
      if (seen.has(plain)) {
        dropped++;
        continue;
      }
      seen.add(plain);
      const decoded = decodeCode(code, pack.check, pack.questions.length);
      if (decoded.ok) good.push({ line: i + 1, learner: decoded.learner, attempts: decoded.attempts });
      else bad.push({ line: i + 1, reason: decoded.reason });
    }
  });
  rows = good;

  if (!good.length && !bad.length) {
    results.hidden = true;
    say(result, 'No codes found. Paste the text messages above.', 'bad');
    codesBox.focus();
    return;
  }
  const parts = [`${good.length} ${good.length === 1 ? 'code' : 'codes'} read`];
  if (bad.length) parts.push(`${bad.length} ${bad.length === 1 ? 'line has' : 'lines have'} a problem`);
  if (dropped) parts.push(`${dropped} repeated ${dropped === 1 ? 'code' : 'codes'} ignored`);
  // Red only when nothing could be read; some bad lines next to good codes are listed below, not an error.
  say(result, parts.join(', ') + '.', !good.length ? 'bad' : bad.length ? '' : 'ok');

  renderProblems(bad);
  renderQuestions(pack, good);
  renderLearners(pack, good);
  showRepeats(good);
  say(csvNote, '');
  results.hidden = false;
}

// 4 and 5. One row per question, most missed first.
function renderQuestions(pack: Pack, good: Good[]): void {
  const total = good.length;
  questionsBody.replaceChildren(
    ...summarise(
      pack,
      good.map((g) => g.attempts),
    ).map((s) => {
      const q = pack.questions[s.index];
      const tr = el('tr');
      const th = el('th', '', { scope: 'row' });
      th.append(el('span', `Q${s.index + 1}. `), q.prompt);
      tr.append(th, el('td', `${s.right} of ${total}`), mostWrong(pack, s.index, s.picks), el('td', `${s.hints} of ${total}`));
      return tr;
    }),
  );
}

function mostWrong(pack: Pack, index: number, picks: number[]): HTMLTableCellElement {
  const q = pack.questions[index];
  const td = el('td');
  if (q.kind === 'short') {
    td.textContent = picks[2] ? `wrong (${picks[2]} ${picks[2] === 1 ? 'learner' : 'learners'})` : 'None';
    return td;
  }
  let best = 0;
  q.options.forEach((o, k) => {
    if (!o.correct && picks[k + 1] > (best ? picks[best] : 0)) best = k + 1;
  });
  if (!best) {
    td.textContent = 'None';
    return td;
  }
  const option = q.options[best - 1];
  td.append(`${LETTERS[best - 1]}: ${option.text} (${picks[best]} ${picks[best] === 1 ? 'learner' : 'learners'})`);
  if (option.feedback) td.append(el('span', option.feedback, { class: 'fbline' }));
  return td;
}

// 6. One row per code: class number, first-try score, then one cell per question.
function renderLearners(pack: Pack, good: Good[]): void {
  const head = learnersTable.tHead!.rows[0];
  head.replaceChildren(
    el('th', 'Class number', { scope: 'col' }),
    el('th', 'First-try score', { scope: 'col' }),
    ...pack.questions.map((_, i) => el('th', `Q${i + 1}`, { scope: 'col' })),
  );
  // Class number order; codes with no number last, in the order they were pasted.
  const sorted = [...good].sort((a, b) => (a.learner || 100) - (b.learner || 100) || a.line - b.line);
  learnersTable.tBodies[0].replaceChildren(
    ...sorted.map((g) => {
      const tr = el('tr');
      tr.append(
        el('th', g.learner ? String(g.learner) : 'No number', { scope: 'row' }),
        el('td', `${score(pack, g.attempts)} of ${pack.questions.length}`),
        ...pack.questions.map((q, i) => cell(pack, i, g.attempts[i])),
      );
      return tr;
    }),
  );
}

/** "✓", "✗ B" or "–", plus " + hint". The marks are hidden from screen readers, which hear words instead. */
function cell(pack: Pack, index: number, a: Attempt): HTMLTableCellElement {
  const q = pack.questions[index];
  let mark: string;
  let words: string;
  if (a.answer === 0) [mark, words] = ['–', 'blank'];
  else if (attemptIsRight(q, a)) [mark, words] = ['✓', 'right'];
  else if (q.kind === 'choice') [mark, words] = [`✗ ${LETTERS[a.answer - 1]}`, `wrong, ${LETTERS[a.answer - 1]}`];
  else [mark, words] = ['✗', 'wrong'];
  if (a.hint) [mark, words] = [`${mark} + hint`, `${words}, opened the hint`];
  const td = el('td');
  td.append(el('span', mark, { 'aria-hidden': 'true' }), el('span', words, { class: 'sr-only' }));
  return td;
}

// 7. One plain message per bad line.
function renderProblems(bad: Bad[]): void {
  const message: Record<Bad['reason'], string> = {
    checksum: 'this code has a typing mistake. Ask the learner to send it again.',
    version: 'this code has a typing mistake. Ask the learner to send it again.',
    worksheet: 'this code belongs to a different worksheet.',
    length: 'this code is too short or too long for this worksheet.',
  };
  problems.replaceChildren(...bad.map((b) => el('li', `Line ${b.line}: ${message[b.reason]}`)));
  problems.hidden = problemsHeading.hidden = bad.length === 0;
}

function showRepeats(good: Good[]): void {
  const counts = new Map<number, number>();
  for (const g of good) if (g.learner) counts.set(g.learner, (counts.get(g.learner) ?? 0) + 1);
  const twice = [...counts].filter(([, n]) => n > 1).sort((a, b) => a[0] - b[0]);
  repeats.textContent = twice.map(([num, n]) => `Class number ${num} appears ${n === 2 ? 'twice' : `${n} times`}.`).join(' ');
  repeats.hidden = twice.length === 0;
}

// 8. The learners table as a CSV file, made on this device.
function downloadCsv(): void {
  const pack = current;
  if (!pack || !rows.length) return;
  const header = ['class_number', 'first_try_score', ...pack.questions.flatMap((_, i) => [`q${i + 1}`, `q${i + 1}_hint`])];
  const lines = rows.map((g) => [
    g.learner ? String(g.learner) : '',
    String(score(pack, g.attempts)),
    ...pack.questions.flatMap((q, i) => {
      const a = g.attempts[i];
      const answer = a.answer === 0 ? '' : q.kind === 'choice' ? LETTERS[a.answer - 1] : a.answer === 1 ? 'right' : 'wrong';
      return [answer, a.hint ? '1' : '0'];
    }),
  ]);
  const csv = [header, ...lines].map((r) => r.join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(pack).replace(/\.html$/, '-answers.csv');
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say(csvNote, `Downloaded ${a.download}.`);
}

// Eight made-up codes for the sample worksheet, plus one typing mistake and one from another worksheet.
function loadSampleCodes(): void {
  const parsed = parseWorksheet(SAMPLE);
  if (!parsed.ok) return;
  const pack = parsed.pack;
  if (!known.has(pack.id)) addOption(pack, `${pack.title} (${pack.id}), sample`);
  const text = codesBox.value.trim();
  const codes = sampleCodes(pack);
  if (text && text !== codes && !confirm('Replace the codes you pasted with the sample codes?')) return;
  codesBox.value = codes;
  results.hidden = true; // so choose() does not read twice
  choose(pack.id);
  readCodes();
}

document.documentElement.className = 'js';
picker.addEventListener('change', () => choose(picker.value));
linkInput.addEventListener('input', onLink);
$('read').addEventListener('click', readCodes);
$('sample-codes').addEventListener('click', loadSampleCodes);
$('csv').addEventListener('click', downloadCsv);
loadPacks();
registerSW();
