import { expect, test } from '@playwright/test';
import { makeLargeJson } from './support/generate';

const MB = 1024 * 1024;
const MARGIN = Number(process.env.PERF_MARGIN ?? '1');
const budget = (ms: number) => ms * MARGIN;

test.setTimeout(120_000);

test('opens a 20 MB JSON file in text mode within budget', async ({ page }) => {
  const json = makeLargeJson(20 * MB);
  await page.goto('/#/tools/json-editor');
  await expect(page.getByTestId('json-editor-view').locator('.cm-content')).toBeVisible();

  const started = Date.now();
  await page.getByTestId('file-input').setInputFiles({
    name: 'big.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  const openAnyway = page.getByRole('button', { name: /open anyway/i });
  if (await openAnyway.isVisible().catch(() => false)) await openAnyway.click();
  await expect(page.getByTestId('status-bar')).toContainText('Valid JSON', { timeout: 30_000 });
  const elapsed = Date.now() - started;

  console.log(`20 MB open: ${elapsed} ms (budget ${budget(3000)} ms)`);
  expect(elapsed).toBeLessThan(budget(3000));
});

test('compares two 5 MB documents within budget and keeps the UI responsive', async ({ page }) => {
  const left = makeLargeJson(5 * MB);
  const right = left
    .replace('"user500@example.com"', '"changed@example.com"')
    .replace('"user-1500"', '"renamed"');
  await page.goto('/#/tools/json-compare');
  await expect(page.getByTestId('compare-left').locator('.cm-content')).toBeVisible();

  await page.evaluate(() => {
    const w = window as unknown as { __maxFrameGap: number };
    w.__maxFrameGap = 0;
    let last = performance.now();
    const tick = (now: number) => {
      w.__maxFrameGap = Math.max(w.__maxFrameGap, now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const started = Date.now();
  await page
    .getByTestId('file-input-left')
    .setInputFiles({ name: 'l.json', mimeType: 'application/json', buffer: Buffer.from(left) });
  await page
    .getByTestId('file-input-right')
    .setInputFiles({ name: 'r.json', mimeType: 'application/json', buffer: Buffer.from(right) });
  await expect(page.getByTestId('compare-summary')).toHaveText(
    '2 changes: 0 added, 0 removed, 2 changed, 0 moved',
    { timeout: 30_000 },
  );
  const elapsed = Date.now() - started;
  const maxGap = await page.evaluate(
    () => (window as unknown as { __maxFrameGap: number }).__maxFrameGap,
  );

  console.log(
    `5 MB compare: ${elapsed} ms (budget ${budget(3000)} ms), max frame gap ${Math.round(maxGap)} ms`,
  );
  expect(elapsed).toBeLessThan(budget(3000));
  expect(maxGap).toBeLessThan(budget(1000));
});
