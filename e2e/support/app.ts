import { expect, type Page } from '@playwright/test';

export interface ToolLink {
  name: string;
  href: string;
}

/** Reads the tool list from the rendered sidebar, so tests follow the real registry. */
export async function collectToolLinks(page: Page): Promise<ToolLink[]> {
  await page.goto('/');
  const links = page.getByRole('navigation', { name: 'Tools' }).getByRole('link');
  await expect(links.first()).toBeVisible();
  return links.evaluateAll((els) =>
    els.map((el) => ({ name: el.textContent?.trim() ?? '', href: el.getAttribute('href') ?? '' })),
  );
}

export async function visitTool(page: Page, tool: ToolLink): Promise<void> {
  await page.goto(`/${tool.href}`);
  await expect(page.getByRole('heading', { level: 1, name: tool.name })).toBeVisible();
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

export function toolIdOf(tool: ToolLink): string {
  return tool.href.replace('#/tools/', '');
}

/** Collects uncaught page errors and console.error output. */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}
