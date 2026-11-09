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
  await page.goto('/#/tools/json');
  const editor = page.getByTestId('json-editor-left');
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

test('Go to JSON navigates', async ({ page }) => {
  await pretend(page, 'Win32');
  await page.goto('/#/tools/json');
  await button(page).click();
  await palette(page).getByRole('combobox').fill('go to json');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/tools\/json$/);
  await expect(page.getByRole('heading', { level: 1, name: 'JSON' })).toBeVisible();
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

test('clicking a non-focusable part of the palette keeps Escape and Tab working', async ({
  page,
}) => {
  await pretend(page, 'Win32');
  await page.goto('/#/tools/json');
  await button(page).click();
  await palette(page).getByRole('combobox').fill('zzz-no-match');
  await palette(page).getByText('No matching commands').click();
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const size of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`at ${size.width}×${size.height} the button covers no editor, scrollbar or status line, drawer closed or open`, async ({
    page,
  }) => {
    await pretend(page, 'Win32');
    await page.setViewportSize(size);
    await page.goto('/#/tools/json');
    const left = page.getByTestId('json-editor-left');
    const right = page.getByTestId('json-editor-right');
    await expect(right.locator('.cm-content')).toBeVisible();
    const long = JSON.stringify(
      Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i])),
    );
    await setCodeMirrorText(left, long);
    await setCodeMirrorText(right, long.replace('"k199":199', '"k199":-1'));
    const covered = async () => {
      const b = (await button(page).boundingBox())!;
      const hits: string[] = [];
      for (const testId of [
        'json-editor-right',
        'status-right',
        'json-editor-left',
        'status-left',
      ]) {
        const box = await page.getByTestId(testId).boundingBox();
        if (box && overlaps(b, box)) hits.push(testId);
      }
      return hits;
    };
    expect(await covered()).toEqual([]);

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
    await expect.poll(covered).toEqual([]);
    const b = (await button(page).boundingBox())!;
    expect(overlaps(b, (await drawer.boundingBox())!)).toBe(false);
    expect(
      overlaps(b, (await drawer.getByRole('button', { name: 'Close changes' }).boundingBox())!),
    ).toBe(false);
  });
}
