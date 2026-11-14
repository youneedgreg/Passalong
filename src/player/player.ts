import { encodeCode } from '../core/code';
import { score, shortIsRight } from '../core/grade';
import { renderPack } from '../core/render';
import type { Attempt, Pack } from '../core/types';

type Saved = { learner: number; first: (Attempt | null)[]; solved: boolean[]; hints: boolean[] };

function load(key: string, total: number): Saved {
  const fresh: Saved = {
    learner: 0,
    first: new Array(total).fill(null),
    solved: new Array(total).fill(false),
    hints: new Array(total).fill(false),
  };
  try {
    const raw = localStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    return saved && saved.first.length === total ? saved : fresh;
  } catch {
    return fresh; // storage can be blocked when the pack is opened as a file
  }
}

function save(key: string, state: Saved): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* keep going in memory */
  }
}

export function startPlayer(app: HTMLElement, pack: Pack): void {
  const total = pack.questions.length;
  const key = `passalong:${pack.id}`;
  let state = load(key, total);

  document.title = `${pack.title} · Passalong`;
  app.innerHTML =
    renderPack(pack) +
    `<section class="finish js-only" aria-labelledby="finish-h"><h2 id="finish-h">Finished?</h2>` +
    `<label for="learner">Your class number (optional, 1 to 99)</label>` +
    `<input id="learner" type="text" inputmode="numeric" maxlength="2" autocomplete="off">` +
    `<p><button type="button" id="finish">Show my code</button></p>` +
    `<div id="result" role="status" tabindex="-1"></div></section>`;

  const fb = (i: number) => app.querySelector<HTMLElement>(`#q${i + 1}-fb`)!;
  const why = (i: number) => app.querySelector<HTMLElement>(`#q${i + 1}-why`);
  const inputs = (i: number) => Array.from(app.querySelectorAll<HTMLInputElement>(`[name="q${i + 1}"]`));

  function lock(i: number): void {
    inputs(i).forEach((el) => (el.disabled = true));
    app.querySelector<HTMLButtonElement>(`.check[data-i="${i}"]`)!.disabled = true;
    const w = why(i);
    if (w) w.hidden = false;
  }

  function check(i: number): void {
    const q = pack.questions[i];
    let answer = 0;
    let right = false;
    let note = '';
    if (q.kind === 'choice') {
      const picked = inputs(i).find((el) => el.checked);
      if (!picked) {
        fb(i).textContent = 'Choose an answer first.';
        return;
      }
      answer = Number(picked.value);
      const option = q.options[answer - 1];
      right = option.correct;
      note = option.feedback ?? '';
    } else {
      const typed = inputs(i)[0].value;
      if (!typed.trim()) {
        fb(i).textContent = 'Type an answer first.';
        return;
      }
      right = shortIsRight(q, typed);
      answer = right ? 1 : 2;
    }
    if (!state.first[i]) state.first[i] = { answer, hint: false };
    if (right) {
      state.solved[i] = true;
      fb(i).textContent = 'Correct.';
      fb(i).className = 'fb right';
      lock(i);
    } else {
      fb(i).textContent = `Not yet. ${note} Try again${q.hint ? ', or open the hint' : ''}.`.replace(/\s+/g, ' ');
      fb(i).className = 'fb wrong';
    }
    save(key, state);
  }

  app.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.check');
    if (button) check(Number(button.dataset.i));
  });

  // "toggle" does not bubble, so listen in the capture phase.
  app.addEventListener(
    'toggle',
    (event) => {
      const details = event.target as HTMLDetailsElement;
      const i = Number(details.dataset?.i);
      if (details.open && Number.isInteger(i) && !state.solved[i]) {
        state.hints[i] = true;
        save(key, state);
      }
    },
    true,
  );

  const learner = app.querySelector<HTMLInputElement>('#learner')!;
  const result = app.querySelector<HTMLElement>('#result')!;
  if (state.learner) learner.value = String(state.learner);

  app.querySelector('#finish')!.addEventListener('click', () => {
    state.learner = Math.max(0, Math.min(99, Number(learner.value) || 0));
    save(key, state);
    // Answer = first one checked. Hint = opened at any point before the question was solved.
    const attempts = state.first.map((a, i) => ({ answer: a?.answer ?? 0, hint: state.hints[i] }));
    const code = encodeCode(pack.check, state.learner, attempts);
    const spoken = code.replace(/-/g, '').split('').join(' ');
    const body = encodeURIComponent(`PASSALONG ${code}`);
    const to = pack.teacherSms ?? '';
    const sep = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
    result.innerHTML =
      `<p>First try: <strong>${score(pack, attempts)} of ${total}</strong> correct.</p>` +
      `<p>Send this code to your teacher:</p>` +
      `<p class="code" aria-label="${spoken}">${code}</p>` +
      `<p class="send"><a class="button" href="sms:${to}${sep}body=${body}">Send by SMS</a> ` +
      `<button type="button" id="copy">Copy code</button> ` +
      `<button type="button" id="next">Next learner on this phone</button></p>`;
    result.focus();
    result.querySelector('#copy')!.addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(code);
        (e.target as HTMLElement).textContent = 'Copied';
      } catch {
        (e.target as HTMLElement).textContent = 'Press and hold the code to copy';
      }
    });
    result.querySelector('#next')!.addEventListener('click', () => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* nothing stored */
      }
      state = load(key, total);
      startPlayer(app, pack);
      app.querySelector<HTMLElement>('h1')?.focus();
    });
  });

  // Put back saved progress.
  state.first.forEach((attempt, i) => {
    if (!attempt) return;
    const q = pack.questions[i];
    if (q.kind === 'choice') {
      const el = inputs(i).find((x) => Number(x.value) === attempt.answer);
      if (el) el.checked = true;
    }
    if (state.solved[i]) {
      fb(i).textContent = 'Correct.';
      fb(i).className = 'fb right';
      lock(i);
    }
  });
}
