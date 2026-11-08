import { expect, test } from '@playwright/test';
import { collectToolLinks, toolIdOf, visitTool } from '../support/app';
import { exerciseTool } from '../support/exercise';

test.skip(!process.env.BASE_URL, 'Runs only against a running container: set BASE_URL');

test('index is served with security headers and no-cache', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const h = res.headers();
  const csp = h['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('unsafe-eval');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['cache-control']).toBe('no-cache');
});

test('healthz responds ok', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('ok');
});

test('hashed assets are immutable and keep the CSP', async ({ page, request }) => {
  await page.goto('/');
  const src = await page.locator('script[type="module"]').first().getAttribute('src');
  const res = await request.get(new URL(src!, page.url()).toString());
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('immutable');
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
});

test('no CSP violations while using every tool', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  for (const tool of await collectToolLinks(page)) {
    await visitTool(page, tool);
    await exerciseTool(page, toolIdOf(tool));
  }
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});

test('transform queries run without CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto('/#/tools/json-editor');
  const editor = page.getByTestId('json-editor-view');
  await editor.locator('.cm-content').click();
  await page.keyboard.insertText('{"items":[{"id":1},{"id":2}]}');
  await editor.getByRole('button', { name: /transform/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const language of ['JSONQuery', 'JMESPath', 'JSONPath']) {
    await dialog.getByTitle('Select a query language').click();
    const option = dialog.getByRole('button', { name: new RegExp(language, 'i') });
    if (await option.isVisible().catch(() => false)) await option.click();
  }
  await page.keyboard.press('Escape');
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});

test('every query language, including JSONPath filters, runs without CSP violations', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto('/#/tools/json-editor');
  const editor = page.getByTestId('json-editor-view');
  await editor.locator('.cm-content').click();
  await page.keyboard.insertText('{"items":[{"id":1},{"id":2}]}');
  await editor.getByRole('button', { name: /transform/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const queries = [
    { language: 'JSONQuery', query: 'get("items")' },
    { language: 'JMESPath', query: 'items[?id==`1`]' },
    { language: 'JSONPath', query: '$.items[?(@.id==1)]' },
  ];
  for (const { language, query } of queries) {
    await dialog.getByTitle('Select a query language').click();
    await page.getByTitle(`Select ${language} as query language`).click();
    await dialog.locator('textarea.jse-query').fill(query);
    // The preview pane must render a result (not stay empty or show an error).
    await expect(dialog.getByText('Empty document')).toBeHidden();
    await expect(dialog.locator('.jse-preview-data .jse-json-node').first()).toBeVisible();
  }
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});
