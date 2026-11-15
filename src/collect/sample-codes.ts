import { ALPHABET } from '../core/hash';
import { encodeCode } from '../core/code';
import type { Attempt, Pack } from '../core/types';

// Eight made-up learners for the sample worksheet. answer: 1..6 = option picked first (choice), 1 = right / 2 = wrong (typed), 0 = blank.
// Correct options in the sample: Q1 1, Q2 2, Q3 typed, Q4 2, Q5 typed, Q6 3.
const CLASS: [number, number[], number[]][] = [
  // [class number, first answers for Q1..Q6, questions where the hint was opened]
  [3, [1, 2, 1, 2, 1, 3], []],
  [5, [2, 2, 1, 2, 2, 1], [1]],
  [8, [1, 1, 2, 2, 1, 1], []],
  [11, [2, 2, 1, 1, 1, 2], [6]],
  [14, [1, 2, 1, 2, 2, 3], []],
  [17, [1, 2, 2, 2, 1, 1], [3]],
  [21, [2, 4, 1, 3, 0, 1], []],
  [26, [1, 2, 1, 2, 1, 3], []],
];

function attempts(answers: number[], hints: number[]): Attempt[] {
  return answers.map((answer, i) => ({ answer, hint: hints.includes(i + 1) }));
}

/** One typing mistake: swap one character for the next letter of the code alphabet. */
function withTypo(code: string): string {
  const at = 6; // inside the second group, never a hyphen
  const next = ALPHABET[(ALPHABET.indexOf(code[at]) + 1) % ALPHABET.length];
  return code.slice(0, at) + next + code.slice(at + 1);
}

/**
 * Ten lines as text messages would arrive: eight good codes, one with a typing mistake (line 4)
 * and one from a different worksheet (line 9). Built from the sample pack, so they stay right if the sample changes.
 */
export function sampleCodes(pack: Pack): string {
  const good = CLASS.map(([n, a, h]) => encodeCode(pack.check, n, attempts(a, h)));
  const otherWorksheet = encodeCode((pack.check + 1) & 0xfff, 30, attempts([1, 2, 1, 2, 1, 3], []));
  const lines = [good[0], good[1], good[2], withTypo(good[3]), good[3], good[4], good[5], good[6], otherWorksheet, good[7]];
  return lines.map((code) => `PASSALONG ${code}`).join('\n');
}
