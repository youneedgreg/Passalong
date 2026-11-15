// End-to-end check in headless Chrome: single-file pack from disk, then the link player offline.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { parseWorksheet } = await server.ssrLoadModule('/src/core/parse.ts');
const { fillTemplate, fileName } = await server.ssrLoadModule('/src/core/file.ts');
const { encodeLink } = await server.ssrLoadModule('/src/core/link.ts');
const { decodeCode } = await server.ssrLoadModule('/src/core/code.ts');
const { SAMPLE } = await server.ssrLoadModule('/src/core/sample.ts');
const pack = parseWorksheet(SAMPLE).pack;

mkdirSync('out', { recursive: true });
const html = fillTemplate(readFileSync('dist/pack-template.html', 'utf8'), pack);
const file = `out/${fileName(pack)}`;
writeFileSync(file, html);
console.log('single file:', file, (html.length / 1024).toFixed(1), 'KB');

// Uses the Chrome installed on this computer. Set CHROME_PATH if it is somewhere unusual.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : { channel: 'chrome' },
);

async function play(page, label) {
  // Q1 wrong first (option 2), then right. Q3 typed right with hint opened. Rest untouched.
  await page.check('input[name="q1"][value="2"]');
  await page.click('.check[data-i="0"]');
  const wrong = await page.textContent('#q1-fb');
  await page.check('input[name="q1"][value="1"]');
  await page.click('.check[data-i="0"]');
  const right = await page.textContent('#q1-fb');
  await page.click('#q3 summary');
  await page.fill('#q3-in', ' 7 / 8 ');
  await page.click('.check[data-i="2"]');
  await page.fill('#learner', '17');
  await page.click('#finish');
  const code = await page.textContent('.code');
  const sms = await page.getAttribute('.send a', 'href');
  const decoded = decodeCode(code, pack.check, pack.questions.length);
  console.log(`[${label}]`, { wrong, right, code, sms, decoded: JSON.stringify(decoded) });
  return code;
}

// 1. The pack opened straight from disk.
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  console.log('[file] title:', await page.title(), '| html class:', await page.getAttribute('html', 'class'));
  await play(page, 'file');
  console.log('[file] page errors:', errors);
  await page.close();
}

// 2. The same pack with scripts off.
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  console.log('[no-js] questions:', await page.locator('.q').count(), '| check buttons visible:', await page.locator('.check:visible').count(), '| answer key items:', await page.locator('noscript li, .key li').count());
  await context.close();
}

// 3. The link player from the built site, then offline.
{
  const preview = spawn('npx', ['vite', 'preview', '--port', '4317', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = `http://localhost:4317/p/#${encodeLink(SAMPLE)}`;
  console.log('[link] url length:', url.length);
  await page.goto(url);
  console.log('[link] h1:', await page.textContent('h1'));
  // localhost counts as secure, so register the worker by hand for this test.
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload();
  console.log('[offline] h1 after reload:', await page.textContent('h1'));
  await play(page, 'offline');
  const second = await context.newPage();
  await second.goto('http://localhost:4317/p#' + encodeLink(SAMPLE)).catch((e) => console.log('[offline] /p without slash failed:', e.message));
  console.log('[offline] /p without slash h1:', await second.textContent('h1').catch(() => 'n/a'));
  await context.close();

  // 4. The Make screen: sample is ready, break it, jump to the problem, fix it, open the link, download the file.
  const make = await browser.newContext({ acceptDownloads: true });
  const page4 = await make.newPage();
  const errors = [];
  page4.on('pageerror', (e) => errors.push(String(e)));
  await page4.goto('http://localhost:4317/');
  await page4.waitForFunction(() => document.getElementById('status').textContent.startsWith('Ready'));
  await page4.waitForFunction(() => !document.getElementById('sizes').textContent.startsWith('File: …'));
  console.log('[make] status:', await page4.textContent('#status'), '|', await page4.textContent('#sizes'));
  const sampleText = await page4.inputValue('#box');
  await page4.fill('#box', sampleText.replace('* 5/6\n', ''));
  await page4.waitForSelector('#problems button');
  console.log('[make] broken:', await page4.textContent('#status'), '|', await page4.textContent('#problems'), '| copy disabled:', await page4.isDisabled('#copy'), '| open href:', await page4.getAttribute('#open', 'href'));
  await page4.click('#problems button');
  const picked = await page4.evaluate(() => { const b = document.getElementById('box'); return document.activeElement === b ? b.value.slice(b.selectionStart, b.selectionEnd) : 'box not focused'; });
  console.log('[make] jump selects:', JSON.stringify(picked));
  await page4.fill('#box', sampleText);
  await page4.waitForFunction(() => document.getElementById('status').textContent.startsWith('Ready'));
  const href = await page4.getAttribute('#open', 'href');
  const unsaved = await page4.evaluate(() => localStorage.getItem('passalong:packs'));
  console.log('[make] saved before Open/Copy/Download:', unsaved);
  console.log('[make] fixed:', await page4.textContent('#status'), '| link is the sample link:', href === `http://localhost:4317/p/#${encodeLink(SAMPLE)}`);
  const [learner] = await Promise.all([make.waitForEvent('page'), page4.click('#open')]);
  await learner.waitForLoadState();
  console.log('[make] learner tab h1:', await learner.textContent('h1'), '| saved after Open:', await page4.evaluate(() => JSON.parse(localStorage.getItem('passalong:packs') ?? '[]').map((p) => p.id)));
  const [dl] = await Promise.all([page4.waitForEvent('download'), page4.click('#download')]);
  const saved = readFileSync(await dl.path(), 'utf8');
  console.log('[make] download:', dl.suggestedFilename(), saved.length, 'bytes | same as e2e file:', saved === html);
  const stored = await page4.evaluate(() => JSON.parse(localStorage.getItem('passalong:packs')).map((p) => p.id));
  console.log('[make] saved packs:', stored, '| page errors:', errors);
  await make.close();
  preview.kill();
}

await browser.close();
await server.close();
