import type { Attempt, Pack, Question, ShortQuestion } from './types';

export function tidyAnswer(text: string): string {
  return text.normalize('NFC').trim().toLowerCase().replace(/\s+/g, '');
}

export function shortIsRight(q: ShortQuestion, typed: string): boolean {
  const mine = tidyAnswer(typed);
  if (!mine) return false;
  return q.accepted.some((accepted) => {
    const theirs = tidyAnswer(accepted);
    if (mine === theirs) return true;
    const a = Number(mine);
    const b = Number(theirs);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  });
}

/** Was the recorded first attempt correct? */
export function attemptIsRight(q: Question, attempt: Attempt): boolean {
  if (attempt.answer === 0) return false;
  if (q.kind === 'short') return attempt.answer === 1;
  return q.options[attempt.answer - 1]?.correct === true;
}

export function score(pack: Pack, attempts: Attempt[]): number {
  return pack.questions.filter((q, i) => attempts[i] && attemptIsRight(q, attempts[i])).length;
}

export type QuestionSummary = {
  index: number;
  answered: number;
  right: number;
  hints: number;
  /** picks[k] = how many learners chose answer value k first (k = 0 is blank). */
  picks: number[];
};

/** Class view: one row per question, most-missed first. */
export function summarise(pack: Pack, all: Attempt[][]): QuestionSummary[] {
  const rows = pack.questions.map((q, index) => {
    const picks = new Array<number>(8).fill(0);
    let right = 0;
    let hints = 0;
    for (const attempts of all) {
      const a = attempts[index];
      picks[a.answer]++;
      if (a.hint) hints++;
      if (attemptIsRight(q, a)) right++;
    }
    return { index, answered: all.length - picks[0], right, hints, picks };
  });
  return rows.sort((a, b) => a.right - b.right || a.index - b.index);
}
