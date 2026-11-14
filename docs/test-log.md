# Test log

What was tested, how, on what, and what happened. A test that failed or was not run stays here, marked as such. Nothing here says "fully accessible": it says what Passalong was tested with and what it was not tested with.

All test data is made up: the sample worksheet in `src/core/sample.ts` and invented class numbers. People who helped test are not named, and their answers and codes are not kept.

Last updated: 14 Nov 2026.

## Day-1 checks

These checks decide what the demo can honestly claim. They were run before any new code was written.

| # | Check | Passes when | Result |
| --- | --- | --- | --- |
| 1 | Starter runs on a Mac | 22 tests pass; the browser script prints the code `01E1-284G-02ZG` twice | **Passed** (14 Nov). macOS on Apple silicon, Node 24.12.0, Google Chrome. `npm run typecheck` clean; `npm test` 22 of 22; `npm run e2e` printed `01E1-284G-02ZG` twice (pack opened from disk, then the offline link). |
| 2 | Live on HTTPS | Service worker "activated"; an offline reload of `/p/#...` still shows the worksheet | **Passed** (14 Nov) on https://passalong-pi.vercel.app. Worker activated and controlling the page. Offline in Chrome on the Mac: reload kept the worksheet, a wrong answer showed its feedback, the right one showed "Correct.", the code was `01E1-284G-02ZG`. `/`, `/collect/` and `/about/` also opened offline. The only host contacted was `passalong-pi.vercel.app`. |
| 3 | Android, link | Worksheet opens in airplane mode and "Check answer" works | **Passed** (14 Nov). Samsung phone, Chrome, airplane mode. Model, Android version and Chrome version not yet recorded. |
| 4 | Android, file | Note which app opens a pack sent on WhatsApp, and whether "Check answer" works | Not run |
| 5 | Android, SMS | Messages opens with "PASSALONG" and the code filled in | Not run |
| 6 | iPhone | Checks 3 and 5 give the same results | Not run |
| 7 | Oldest phone available | The full loop completes | Not run |
| 8 | Screen reader smoke test | VoiceOver with Safari reads question 1, each option, and "Correct." or "Not yet." | Not run |
| 9 | The "before" file | A phone-scanned PDF of the six sample questions, its size, and a screenshot of it on the phone | **Passed** (14 Nov). The sample questions were printed and scanned with the Google Drive scanner on an Android phone: a 2-page PDF of **2,165,971 bytes** (Drive shows 2.1 MB). The pack for the same worksheet is **21,003 bytes**, so the scan is 103 times larger. |
| 10 | Devpost | Every field of the submission form is visible | Not run |
| 11 | Name | Nothing in education is called Passalong | **Passed** (14 Nov). Searched Devpost and the app stores; one unrelated "Pass-Along" travel app on the App Store. |

## Test table

| # | Test | How to run it | Passes when | Result |
| --- | --- | --- | --- | --- |
| 1 | Keyboard only | Put the mouse away. Tab, Shift+Tab, Space, Enter, and arrow keys inside a question. | The six-step loop completes; focus is always visible; nothing traps focus | Not run |
| 2 | Screen reader, desktop | VoiceOver with Safari (Cmd+F5) on Make, Practise and Collect | Each question is read with its number, each option with its position, and "Correct." or "Not yet." is spoken after checking without focus moving | Not run |
| 3 | Screen reader, phone | TalkBack on an Android phone, on Practise | Same as row 2, and the code is read one character at a time | Not run |
| 4 | Zoom | Browser zoom at 200%, then 400% | No sideways scrolling of the page and no clipped text | Not run |
| 5 | Small screen | DevTools device mode at 320 by 568 | Everything reflows; every button and option is at least 48 px tall | Not run |
| 6 | Contrast | The palette in `base.css`, light and dark | Every text and control pair is at least 4.5 to 1 | Computed from the palette while the starter was written: lowest pair 4.54 to 1 (borders, light theme), body text 17.4 to 1. Not yet re-measured in a browser. |
| 7 | Not colour alone | DevTools, Rendering, emulate achromatopsia | Right and wrong answers are still told apart by their words and marks | Not run |
| 8 | Slow connection | DevTools network throttling at its slowest preset, cache disabled, load a pack link | Worksheet is usable; record the seconds and the bytes transferred | Not run |
| 9 | Offline, link | Load once, then airplane mode, then reopen | Loop completes | **Passed** (14 Nov) on a Samsung phone in Chrome, airplane mode (model and versions to record), and on the live site in Chrome on a Mac. |
| 10 | Offline, file | Open the downloaded pack from disk with no network | Loop completes | **Passed** in headless Chrome on a Mac (`npm run e2e`, 14 Nov). Not yet on a phone. |
| 11 | Scripts off | Disable JavaScript and open the pack file | Questions and the answer key are readable; no dead buttons show | **Passed** in headless Chrome on a Mac (`npm run e2e`, 14 Nov): 6 questions, 6 answer-key items, 0 check buttons visible. |
| 12 | Shared phone | Finish as class number 17, choose "Next learner on this phone", finish as 18 | Two different codes; the first learner's answers are gone | Not run |
| 13 | Old phone | The oldest phone available; note model, Android and Chrome versions | Loop completes | Not run |
| 14 | Typing mistakes in a code | Unit test (`tests/core.test.ts`, "catches every single-character typo") | All 372 single-character typos rejected (12 characters × 31 wrong letters) | **Passed** (14 Nov, Vitest 5.1.0, Node 24.12.0). |
| 15 | Automated checks | Lighthouse accessibility and the axe DevTools extension on all three screens | Record the score and the number of issues, whatever they are | Not run |
| 16 | Plain language | Read every on-screen sentence aloud to someone who is not a developer | They can say what each one means | Not run |

## Not tested

- Switch access, a Braille display, and a real 2G network.
- Any phone other than the one Samsung in check 3.
