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

async function play(page, label, { fresh = true } = {}) {
  // "Skip to the end" is the first thing Tab reaches; Enter moves focus to "Finished?" and leaves the address alone.
  // Only on a fresh load: after "Next learner" focus starts on the title, past the link.
  let firstTab = 'not checked', skip = 'not checked';
  if (fresh) {
    const hashBefore = await page.evaluate(() => location.hash);
    await page.keyboard.press('Tab');
    firstTab = await page.evaluate(() => document.activeElement.textContent);
    await page.keyboard.press('Enter');
    skip = await page.evaluate((h) => `${document.activeElement.id}, address ${location.hash === h ? 'unchanged' : 'CHANGED'}`, hashBefore);
  }
  const solvedAtStart = await page.textContent('#solved');
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
  const solved = await page.textContent('#solved');
  await page.fill('#learner', '17');
  await page.click('#finish');
  const code = await page.textContent('.code');
  const sms = await page.getAttribute('.send a', 'href');
  const decoded = decodeCode(code, pack.check, pack.questions.length);
  console.log(`[${label}]`, { firstTab, skip, solvedAtStart, solved, wrong, right, code, sms, decoded: JSON.stringify(decoded) });
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
  // "Next learner on this phone" starts the player again: answers cleared, and #app keeps one click and one toggle listener.
  await page.click('#next');
  const cdp = await context.newCDPSession(page);
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.getElementById("app")' });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  const count = (type) => listeners.filter((l) => l.type === type).length;
  console.log('[next learner]', await page.textContent('#solved'), '| Q1 checked:', await page.isChecked('input[name="q1"][value="1"]'), '| #app listeners: click', count('click'), 'toggle', count('toggle'));
  await play(page, 'next learner', { fresh: false });
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
  // The pack Make saved shows up in Collect's list on the same device.
  await page4.goto('http://localhost:4317/collect/');
  console.log('[collect] saved packs in the list:', await page4.$$eval('#pack option', (o) => o.map((x) => x.textContent)));
  await make.close();

  // 5. Collect from scratch: no saved packs, then the sample codes, the tables, the CSV and a pasted link.
  const col = await browser.newContext({ acceptDownloads: true });
  const page5 = await col.newPage();
  const errors5 = [];
  page5.on('pageerror', (e) => errors5.push(String(e)));
  await page5.goto('http://localhost:4317/collect/');
  console.log('[collect] empty:', await page5.isVisible('#pack-empty'), '|', await page5.textContent('#pack-empty'));
  await page5.click('#read');
  console.log('[collect] read with no worksheet:', await page5.textContent('#result'));
  await page5.click('#sample-codes');
  console.log('[collect] sample:', await page5.textContent('#pack-status'), '|', await page5.textContent('#result'));
  console.log('[collect] problems:', await page5.$$eval('#problems li', (l) => l.map((x) => x.textContent)));
  console.log('[collect] questions:', await page5.$$eval('#questions tbody tr', (r) => r.map((x) => [...x.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' | '))));
  console.log('[collect] learners:', await page5.$$eval('#learners tbody tr', (r) => r.map((x) => [...x.children].map((c) => c.querySelector('[aria-hidden]')?.textContent ?? c.textContent).join(' '))));
  console.log('[collect] repeats shown:', await page5.isVisible('#repeats'));
  await page5.fill('#codes', (await page5.evaluate(() => document.getElementById('codes').value)) + '\nPASSALONG 01E1-284G-02ZG');
  await page5.click('#read');
  console.log('[collect] class number twice:', await page5.textContent('#result'), '|', await page5.textContent('#repeats'));
  await page5.fill('#codes', (await page5.evaluate(() => document.getElementById('codes').value)).replace(/\nPASSALONG 01E1-284G-02ZG$/, ''));
  await page5.click('#read');
  const [csv] = await Promise.all([page5.waitForEvent('download'), page5.click('#csv')]);
  const csvText = readFileSync(await csv.path(), 'utf8');
  console.log('[collect] csv:', csv.suggestedFilename(), '| lines:', csvText.trim().split('\r\n').length, '|', csvText.split('\r\n').slice(0, 2).join(' / '));
  await page5.fill('#link', `http://localhost:4317/p/#${encodeLink(SAMPLE)}`);
  console.log('[collect] link pasted:', await page5.textContent('#pack-status'));
  await page5.fill('#link', 'http://localhost:4317/p/#nonsense');
  console.log('[collect] bad link:', await page5.textContent('#pack-status'));
  await page5.fill('#codes', 'PASSALONG 01E1-284G-02ZG\nPASSALONG 01E1-284G-02ZG\nthanks teacher');
  await page5.click('#read');
  console.log('[collect] e2e code + repeat + chatter:', await page5.textContent('#result'), '|', await page5.$$eval('#problems li', (l) => l.map((x) => x.textContent)));
  console.log('[collect] page errors:', errors5);
  await col.close();

  // 6. The About page: static, readable with scripts off, and it asks nothing of any other host.
  for (const js of [true, false]) {
    const about = await browser.newContext({ javaScriptEnabled: js });
    const page6 = await about.newPage();
    const errors6 = [];
    const hosts6 = new Set();
    page6.on('pageerror', (e) => errors6.push(String(e)));
    page6.on('request', (r) => hosts6.add(new URL(r.url()).host));
    await page6.goto('http://localhost:4317/about/');
    const sections = await page6.$$eval('main h2', (h) => h.map((x) => x.textContent));
    const rows = await page6.locator('#tests-h ~ .scroll tbody tr').count();
    const wide = await page6.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page6.setViewportSize({ width: 320, height: 568 });
    const wide320 = await page6.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(`[about${js ? '' : ', scripts off'}]`, await page6.textContent('h1'), '|', sections.join(', '), '| test rows:', rows, '| sideways scroll at 320 px:', wide320 || wide, '| hosts:', [...hosts6], '| page errors:', errors6);
    await about.close();
  }
  preview.kill();
}

await browser.close();
await server.close();
