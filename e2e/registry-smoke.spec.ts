import { expect, test } from '@playwright/test';
import { collectToolLinks, visitTool, watchPageErrors } from './support/app';

test('every registered tool loads without errors', async ({ page }) => {
  const errors = watchPageErrors(page);
  const tools = await collectToolLinks(page);
  expect(tools.length).toBeGreaterThan(0);
  for (const tool of tools) {
    expect(tool.name, `tool ${tool.href} has a name`).not.toBe('');
    await visitTool(page, tool);
  }
  expect(errors).toEqual([]);
});

test('unknown routes show not found', async ({ page }) => {
  await page.goto('/#/tools/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Tool not found' })).toBeVisible();
});
