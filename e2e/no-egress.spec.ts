import { expect, test } from '@playwright/test';
import { collectToolLinks, toolIdOf, visitTool } from './support/app';
import { exerciseTool } from './support/exercise';

const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

test('no request leaves the app origin while using every tool', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const offenders: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (NETWORK_PROTOCOLS.has(url.protocol) && url.origin !== origin) offenders.push(req.url());
  });
  page.on('websocket', (ws) => offenders.push(`websocket: ${ws.url()}`));

  for (const tool of await collectToolLinks(page)) {
    await visitTool(page, tool);
    await exerciseTool(page, toolIdOf(tool));
    await page.waitForLoadState('networkidle');
  }
  expect(offenders).toEqual([]);
});
