export type Option = { text: string; correct: boolean; feedback?: string };

export type ChoiceQuestion = {
  kind: 'choice';
  prompt: string;
  options: Option[];
  hint?: string;
  why?: string;
};

export type ShortQuestion = {
  kind: 'short';
  prompt: string;
  accepted: string[];
  hint?: string;
  why?: string;
};

export type Question = ChoiceQuestion | ShortQuestion;

export type Pack = {
  title: string;
  subject?: string;
  level?: string;
  lang: string;
  intro?: string;
  teacherSms?: string;
  questions: Question[];
  /** Canonical worksheet text. This is what gets hashed and shared. */
  source: string;
  /** 12-bit worksheet check, stored in every answer code. */
  check: number;
  /** 4-character worksheet ID shown to people. */
  id: string;
};

export type ParseError = { line: number; message: string };

export type ParseResult =
  | { ok: true; pack: Pack }
  | { ok: false; errors: ParseError[] };

/** answer: 0 = blank. Choice: 1..6 = option picked first. Short: 1 = right, 2 = wrong. */
export type Attempt = { answer: number; hint: boolean };
