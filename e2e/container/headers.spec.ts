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
