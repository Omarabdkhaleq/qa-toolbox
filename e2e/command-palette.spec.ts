import { expect, test, type Page } from '@playwright/test';
import { readCodeMirrorText, setCodeMirrorText } from './support/codemirror';

/** Pins the detected OS regardless of the machine running the tests. */
const pretend = (page: Page, platform: 'MacIntel' | 'Win32') =>
  page.addInitScript((p) => {
    Object.defineProperty(navigator, 'platform', { get: () => p });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  }, platform);

const button = (page: Page) => page.getByRole('button', { name: 'Commands and shortcuts' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

test('floating button sits bottom-right and shows Ctrl+K', async ({ page }) => {
  await pretend(page, 'Win32');
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/#/tools/json');
  await expect(button(page)).toContainText('Ctrl+K');
  const box = (await button(page).boundingBox())!;
  expect(box.height).toBe(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(1000 - (box.x + box.width)).toBeCloseTo(16, 0);
  expect(700 - (box.y + box.height)).toBeCloseTo(16, 0);

  await page.setViewportSize({ width: 1300, height: 700 });
  const wide = (await button(page).boundingBox())!;
  expect(1300 - (wide.x + wide.width)).toBeCloseTo(24, 0);
});

test('floating button shows ⌘K on macOS', async ({ page }) => {
  await pretend(page, 'MacIntel');
  await page.goto('/#/tools/json');
  await expect(button(page)).toContainText('⌘K');
});

test('Ctrl+K opens the palette from inside an editor without editing it (Review Focus 1)', async ({
  page,
}) => {
  await pretend(page, 'Win32');
  await page.goto('/#/tools/json-editor');
  const editor = page.getByTestId('json-editor-view');
  await expect(editor.locator('.cm-content')).toBeVisible();
  await setCodeMirrorText(editor, '{"a":1,"b":2}');
  await editor.locator('.cm-content').click();
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
  await expect(editor.locator('.cm-content')).toBeFocused();
  expect(await readCodeMirrorText(editor)).toBe('{"a":1,"b":2}');
});

test('Go to JSON Editor navigates', async ({ page }) => {
  await pretend(page, 'Win32');
  await page.goto('/#/tools/json');
  await button(page).click();
  await palette(page).getByRole('combobox').fill('go to json editor');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/tools\/json-editor$/);
  await expect(page.getByRole('heading', { level: 1, name: 'JSON Editor' })).toBeVisible();
});

test('Toggle theme switches between light and dark', async ({ page }) => {
  await pretend(page, 'Win32');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/tools/json');
  await button(page).click();
  await palette(page).getByRole('combobox').fill('toggle theme');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the button stays above the Changes drawer', async ({ page }) => {
  await pretend(page, 'Win32');
  await page.goto('/#/tools/json');
  const left = page.getByTestId('json-editor-left');
  const right = page.getByTestId('json-editor-right');
  await setCodeMirrorText(left, '{"a":1}');
  await setCodeMirrorText(right, '{"a":2}');
  const menu = page.getByRole('group', { name: 'Compare controls' });
  await expect(menu.getByRole('checkbox', { name: 'Compare' })).toBeEnabled();
  await menu.getByRole('checkbox', { name: 'Compare' }).check();
  await menu.getByRole('button', { name: /^Changes \(/ }).click();
  const drawer = page.getByRole('region', { name: 'Changes' });
  await expect(drawer).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--drawer-height')),
    )
    .not.toBe('');
  const d = (await drawer.boundingBox())!;
  const b = (await button(page).boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(d.y);
});
