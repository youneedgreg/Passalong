import type { Pack, Question } from './types';

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderQuestion(q: Question, i: number, total: number): string {
  const n = i + 1;
  const count = `<span class="num">Question ${n} of ${total}</span>`;
  const hint = q.hint ? `<details class="hint" data-i="${i}"><summary>Hint</summary><p>${esc(q.hint)}</p></details>` : '';
  const why = q.why ? `<div class="why" id="q${n}-why" hidden><h3>Worked answer</h3><p>${esc(q.why)}</p></div>` : '';
  const tail =
    `<p class="actions js-only"><button type="button" class="check" data-i="${i}">Check answer</button></p>` +
    `<p class="fb" id="q${n}-fb" role="status"></p>${hint}${why}`;

  if (q.kind === 'choice') {
    const options = q.options
      .map((o, k) => `<label class="opt"><input type="radio" name="q${n}" value="${k + 1}"> <span>${esc(o.text)}</span></label>`)
      .join('');
    return `<section class="q" id="q${n}" data-i="${i}"><fieldset><legend>${count} ${esc(q.prompt)}</legend>${options}</fieldset>${tail}</section>`;
  }
  return (
    `<section class="q" id="q${n}" data-i="${i}"><label class="prompt" for="q${n}-in">${count} ${esc(q.prompt)}</label>` +
    `<input class="short" id="q${n}-in" name="q${n}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">${tail}</section>`
  );
}

function renderAnswerKey(pack: Pack): string {
  const items = pack.questions
    .map((q) => {
      const answer = q.kind === 'choice' ? q.options.find((o) => o.correct)?.text ?? '' : q.accepted[0];
      return `<li>${esc(answer)}${q.why ? ` <span class="key-why">${esc(q.why)}</span>` : ''}</li>`;
    })
    .join('');
  return `<noscript><section class="key"><h2>Answers</h2><p>This phone opened the worksheet in read-only mode. Work on paper, then check here.</p><ol>${items}</ol></section></noscript>`;
}

/** The whole worksheet as an HTML string. Works with scripts off; player.ts adds checking. */
export function renderPack(pack: Pack): string {
  const meta = [pack.subject, pack.level, `${pack.questions.length} questions`, `Worksheet ${pack.id}`]
    .filter(Boolean)
    .map((part) => esc(part as string))
    .join(' · ');
  const total = pack.questions.length;
  return (
    `<header class="sheet-head"><h1 tabindex="-1">${esc(pack.title)}</h1><p class="meta">${meta}</p>` +
    (pack.intro ? `<p class="intro">${esc(pack.intro)}</p>` : '') +
    `</header>` +
    `<form id="sheet" novalidate lang="${esc(pack.lang)}">` +
    pack.questions.map((q, i) => renderQuestion(q, i, total)).join('') +
    `</form>` +
    renderAnswerKey(pack)
  );
}
