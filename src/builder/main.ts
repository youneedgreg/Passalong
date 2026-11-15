import '../shared/base.css';
import './make.css';
import { charLength } from '../core/code';
import { fileName, fillTemplate } from '../core/file';
import { encodeLink } from '../core/link';
import { parseWorksheet } from '../core/parse';
import { SAMPLE } from '../core/sample';
import type { Pack, ParseError } from '../core/types';
import { registerSW } from '../shared/sw-register';

const STORE = 'passalong:packs';
const MAX_SAVED = 20;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const box = $<HTMLTextAreaElement>('box');
const status = $('status');
const problems = $<HTMLOListElement>('problems');
const openLink = $<HTMLAnchorElement>('open');
const copyButton = $<HTMLButtonElement>('copy');
const downloadButton = $<HTMLButtonElement>('download');
const copyNote = $('copy-note');
const manual = $('manual');
const manualLink = $<HTMLInputElement>('manual-link');
const sizes = $('sizes');

let current: Pack | null = null;
let link = '';
let timer = 0;
let template: string | null = null;
let templateFailed = false;

/** Only touch a live region when its words change, so a screen reader is not told the same thing twice. */
function say(el: HTMLElement, text: string, cls = ''): void {
  if (el.textContent !== text) el.textContent = text;
  el.className = cls;
}

// 1. Parse 200 ms after the last keystroke.
function onInput(): void {
  clearTimeout(timer);
  timer = window.setTimeout(check, 200);
}

function check(): void {
  const result = parseWorksheet(box.value);
  if (result.ok) showReady(result.pack);
  else showProblems(result.errors);
}

function setActions(on: boolean): void {
  copyButton.disabled = !on;
  downloadButton.disabled = !on;
  if (on) {
    openLink.href = link;
    openLink.removeAttribute('aria-disabled');
  } else {
    openLink.removeAttribute('href');
    openLink.setAttribute('aria-disabled', 'true');
  }
}

// 2. One button per problem; the actions stay off until there are none.
function showProblems(errors: ParseError[]): void {
  current = null;
  link = '';
  const n = errors.length;
  say(status, `${n} ${n === 1 ? 'problem' : 'problems'} to fix`, 'bad');
  problems.replaceChildren(
    ...errors.map((e) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Line ${e.line}: ${e.message}`;
      b.addEventListener('click', () => jumpToLine(e.line));
      li.append(b);
      return li;
    }),
  );
  problems.hidden = false;
  setActions(false);
  manual.hidden = true;
  say(sizes, 'File: … · Link: … · Code: …');
}

// 3. The parser counts lines after trimming, so skip the blank lines the trim removed.
function jumpToLine(n: number): void {
  const text = box.value;
  const lead = /^\s*/.exec(text)![0];
  const skipped = lead.split('\n').length - 1;
  const lines = text.split('\n');
  const index = Math.min(n - 1 + skipped, lines.length - 1);
  let start = 0;
  for (let i = 0; i < index; i++) start += lines[i].length + 1;
  box.focus();
  box.setSelectionRange(start, start + lines[index].length);
}

// 4. A valid worksheet: build the link, turn the actions on, update sizes, save it.
function showReady(pack: Pack): void {
  current = pack;
  link = `${location.origin}/p/#${encodeLink(pack.source)}`;
  const n = pack.questions.length;
  say(status, `Ready: ${n} ${n === 1 ? 'question' : 'questions'}.`, 'ok');
  problems.hidden = true;
  problems.replaceChildren();
  setActions(true);
  manualLink.value = link;
  showSizes(pack);
  savePack(pack);
}

// 5. Fetched once, at page load, so nothing is requested later and the service worker can serve it offline.
async function getTemplate(): Promise<string | null> {
  if (template !== null || templateFailed) return template;
  try {
    const response = await fetch('/pack-template.html');
    if (!response.ok) throw new Error(String(response.status));
    template = await response.text();
  } catch {
    templateFailed = true;
  }
  return template;
}

// 6. Fill the template and save it as a file.
async function download(): Promise<void> {
  const pack = current;
  if (!pack) return;
  const tpl = await getTemplate();
  if (!tpl) {
    say(copyNote, 'The file could not be made here. Reload the page while online and try again.');
    return;
  }
  const url = URL.createObjectURL(new Blob([fillTemplate(tpl, pack)], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(pack);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say(copyNote, `Downloaded ${a.download}.`);
}

// 7. Copy the link; if the clipboard is not allowed, show it for copying by hand.
async function copyLink(): Promise<void> {
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    copyButton.textContent = 'Copied';
    say(copyNote, 'Link copied.');
    setTimeout(() => (copyButton.textContent = 'Copy link'), 2000);
  } catch {
    manualLink.value = link;
    manual.hidden = false;
    manualLink.focus();
    manualLink.select();
  }
}

// 8. Keep the 20 most recent packs on this device so Collect can find them.
type Saved = { id: string; title: string; source: string; made: number };

function savePack(pack: Pack): void {
  try {
    const raw = localStorage.getItem(STORE);
    const list: Saved[] = raw ? JSON.parse(raw) : [];
    const kept = Array.isArray(list) ? list.filter((p) => p && p.id !== pack.id) : [];
    kept.unshift({ id: pack.id, title: pack.title, source: pack.source, made: Date.now() });
    localStorage.setItem(STORE, JSON.stringify(kept.slice(0, MAX_SAVED)));
  } catch {
    /* no storage here: Make still works, Collect can use the link */
  }
}

// 9. File size from the filled template, link and code lengths.
function showSizes(pack: Pack): void {
  const file = template ? `${(new Blob([fillTemplate(template, pack)]).size / 1024).toFixed(1)} KB` : templateFailed ? 'not available' : '…';
  say(sizes, `File: ${file} · Link: ${link.length.toLocaleString('en')} characters · Code: ${charLength(pack.questions.length)} characters`);
}

function loadSample(): void {
  const text = box.value.trim();
  if (text && text !== SAMPLE.trim() && !confirm('Replace your worksheet with the sample? Your text will be lost.')) return;
  box.value = SAMPLE;
  check();
  box.focus();
}

document.documentElement.className = 'js';
if (box.value === '') box.value = SAMPLE;
box.addEventListener('input', onInput);
copyButton.addEventListener('click', copyLink);
downloadButton.addEventListener('click', download);
$('sample').addEventListener('click', loadSample);
check();
getTemplate().then(() => current && showSizes(current));
registerSW();
