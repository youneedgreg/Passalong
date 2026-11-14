import { canonical, packCheck, packId } from './hash';
import type { ParseError, ParseResult, Question } from './types';

export const LIMITS = { questions: 20, options: 6, accepted: 5, title: 80 };

const HEADER = /^(title|subject|level|lang|intro|teacher-sms)\s*:\s*(.*)$/i;

type Draft = {
  line: number;
  prompt: string;
  options: { text: string; correct: boolean; feedback?: string }[];
  accepted: string[];
  hint?: string;
  why?: string;
};

export function parseWorksheet(input: string): ParseResult {
  const source = canonical(input);
  const errors: ParseError[] = [];
  const head: Record<string, string> = {};
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  // Where a plain continuation line gets appended.
  let append: ((more: string) => void) | null = null;

  source.split('\n').forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (text === '') {
      append = null;
      return;
    }

    const q = /^Q\s*:\s*(.*)$/i.exec(text);
    if (q) {
      const draft: Draft = { line, prompt: q[1], options: [], accepted: [] };
      current = draft;
      drafts.push(draft);
      append = (more) => (draft.prompt += ' ' + more);
      return;
    }

    if (!current) {
      const h = HEADER.exec(text);
      if (h) {
        const key = h[1].toLowerCase();
        head[key] = h[2];
        append = (more) => (head[key] += ' ' + more);
      } else if (append) {
        append(text);
      } else {
        errors.push({ line, message: 'This line is before the first question and is not a header such as "Title:".' });
      }
      return;
    }

    const draft: Draft = current;
    const opt = /^([*-])\s+(.*)$/.exec(text);
    if (opt) {
      const [optionText, ...rest] = opt[2].split('|');
      const feedback = rest.join('|').trim();
      draft.options.push({
        text: optionText.trim(),
        correct: opt[1] === '*',
        ...(feedback ? { feedback } : {}),
      });
      append = null;
      return;
    }

    const acc = /^=\s*(.*)$/.exec(text);
    if (acc) {
      draft.accepted.push(acc[1].trim());
      append = null;
      return;
    }

    const hint = /^hint\s*:\s*(.*)$/i.exec(text);
    if (hint) {
      draft.hint = hint[1];
      append = (more) => (draft.hint += ' ' + more);
      return;
    }

    const why = /^why\s*:\s*(.*)$/i.exec(text);
    if (why) {
      draft.why = why[1];
      append = (more) => (draft.why += ' ' + more);
      return;
    }

    if (append) append(text);
    else errors.push({ line, message: 'Start this line with "*", "-", "=", "Hint:", "Why:" or "Q:".' });
  });

  const title = (head['title'] ?? '').trim();
  if (!title) errors.push({ line: 1, message: 'Add a first line such as "Title: Adding fractions".' });
  if (title.length > LIMITS.title) errors.push({ line: 1, message: `Keep the title under ${LIMITS.title} characters.` });
  if (drafts.length === 0) errors.push({ line: 1, message: 'Add at least one question. A question starts with "Q:".' });
  if (drafts.length > LIMITS.questions) {
    errors.push({ line: drafts[LIMITS.questions].line, message: `A pack holds up to ${LIMITS.questions} questions. Split this into two packs.` });
  }

  const questions: Question[] = [];
  for (const d of drafts) {
    const prompt = d.prompt.trim();
    if (!prompt) errors.push({ line: d.line, message: 'This question has no text after "Q:".' });
    const extra = { ...(d.hint ? { hint: d.hint.trim() } : {}), ...(d.why ? { why: d.why.trim() } : {}) };

    if (d.options.length > 0 && d.accepted.length > 0) {
      errors.push({ line: d.line, message: 'Use options ("*" and "-") or typed answers ("="), not both, in one question.' });
    } else if (d.options.length > 0) {
      const right = d.options.filter((o) => o.correct).length;
      if (d.options.length < 2) errors.push({ line: d.line, message: 'Give at least two options.' });
      if (d.options.length > LIMITS.options) errors.push({ line: d.line, message: `Give at most ${LIMITS.options} options.` });
      if (right !== 1) errors.push({ line: d.line, message: 'Mark exactly one option as correct with "*".' });
      if (d.options.some((o) => !o.text)) errors.push({ line: d.line, message: 'An option is empty.' });
      questions.push({ kind: 'choice', prompt, options: d.options, ...extra });
    } else if (d.accepted.length > 0) {
      if (d.accepted.length > LIMITS.accepted) errors.push({ line: d.line, message: `Give at most ${LIMITS.accepted} accepted answers.` });
      if (d.accepted.some((a) => !a)) errors.push({ line: d.line, message: 'An accepted answer is empty.' });
      questions.push({ kind: 'short', prompt, accepted: d.accepted, ...extra });
    } else {
      errors.push({ line: d.line, message: 'This question has no answers. Add options ("*", "-") or a typed answer ("=").' });
    }
  }

  if (errors.length > 0) {
    errors.sort((a, b) => a.line - b.line);
    return { ok: false, errors };
  }

  const lang = (head['lang'] ?? 'en').trim() || 'en';
  const opt = (key: string) => {
    const value = (head[key] ?? '').trim();
    return value || undefined;
  };
  return {
    ok: true,
    pack: {
      title,
      lang,
      questions,
      source,
      check: packCheck(source),
      id: packId(source),
      ...(opt('subject') ? { subject: opt('subject') } : {}),
      ...(opt('level') ? { level: opt('level') } : {}),
      ...(opt('intro') ? { intro: opt('intro') } : {}),
      ...(opt('teacher-sms') ? { teacherSms: opt('teacher-sms') } : {}),
    },
  };
}
