import { expect, test, type Page } from '@playwright/test';
import { readCodeMirrorText, setCodeMirrorText } from './support/codemirror';

/** Pins the detected OS regardless of the machine running the tests. */
const pretend = (page: Page, platform: 'MacIntel' | 'Win32') =>
  page.addInitScript((p) => {
    Object.defineProperty(navigator, 'platform', { get: () => p });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  }, platform);

const menuButton = (page: Page) => page.getByRole('button', { name: 'Tools menu' });
const sidebar = (page: Page) => page.locator('#sidebar-nav, nav.sidebar');
const jsonLink = (page: Page) => sidebar(page).getByRole('link', { name: 'JSON' });
const backdrop = (page: Page) => page.getByTestId('sidebar-backdrop');
const toolWidth = async (page: Page) => (await page.locator('.json-tool').boundingBox())!.width;

test.describe('wide screens', () => {
  test.beforeEach(async ({ page }) => {
    await pretend(page, 'Win32');
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/#/tools/json');
    await expect(page.getByTestId('json-editor-left').locator('.cm-content')).toBeVisible();
  });

  test('the sidebar is open by default and the button controls it', async ({ page }) => {
    await expect(sidebar(page)).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(menuButton(page)).toHaveAttribute('title', 'Toggle tools menu (Ctrl+B)');
    const id = await sidebar(page).getAttribute('id');
    await expect(menuButton(page)).toHaveAttribute('aria-controls', id!);
    const box = (await menuButton(page).boundingBox())!;
    expect(box.x).toBeLessThan(40);
  });

  test('toggling hides it, widens the tool, and is remembered across reloads', async ({ page }) => {
    const before = await toolWidth(page);
    await menuButton(page).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await toolWidth(page)).toBeGreaterThan(before + 150);

    await page.reload();
    await expect(sidebar(page)).toBeHidden();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');

    await menuButton(page).click();
    await expect(sidebar(page)).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('the floating command button does not overlap the tool when the sidebar is hidden', async ({
    page,
  }) => {
    await menuButton(page).click();
    const fab = (await page.getByRole('button', { name: 'Commands and shortcuts' }).boundingBox())!;
    const tool = (await page.locator('.json-tool').boundingBox())!;
    expect(fab.y).toBeGreaterThanOrEqual(tool.y + tool.height);
  });

  test('Ctrl+B toggles it, also from inside an editor, without editing', async ({ page }) => {
    const editor = page.getByTestId('json-editor-left');
    await setCodeMirrorText(editor, '{"a":1}');
    await editor.locator('.cm-content').click();
    await page.keyboard.press('Control+B');
    await expect(sidebar(page)).toBeHidden();
    await expect(editor.locator('.cm-content')).toBeFocused();
    await page.keyboard.press('Control+B');
    await expect(sidebar(page)).toBeVisible();
    expect(await readCodeMirrorText(editor)).toBe('{"a":1}');
  });

  test('the palette lists Toggle tools menu with Ctrl+B and runs it', async ({ page }) => {
    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.getByRole('combobox').fill('tools menu');
    const option = palette.getByRole('option', { name: /Toggle tools menu/ });
    await expect(option).toContainText('Ctrl+B');
    await page.keyboard.press('Enter');
    await expect(sidebar(page)).toBeHidden();
  });
});

test('the palette shows ⌘B on macOS and the tooltip says ⌘B', async ({ page }) => {
  await pretend(page, 'MacIntel');
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/#/tools/json');
  await expect(menuButton(page)).toHaveAttribute('title', 'Toggle tools menu (⌘B)');
  await page.keyboard.press('Meta+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox').fill('tools menu');
  await expect(palette.getByRole('option', { name: /Toggle tools menu/ })).toContainText('⌘B');
});

test.describe('narrow screens', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.addInitScript(() => localStorage.setItem('qa-toolbox.sidebar', 'open'));
    await page.goto('/#/tools/json');
    await expect(page.getByTestId('json-editor-left').locator('.cm-content')).toBeVisible();
  });

  test('starts closed and opens as a modal drawer with a backdrop and focus inside', async ({
    page,
  }) => {
    await expect(sidebar(page)).toBeHidden();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await menuButton(page).click();
    const drawer = page.getByRole('dialog', { name: 'Tools' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect(backdrop(page)).toBeVisible();
    await expect(jsonLink(page)).toBeFocused();
    // Wait out the slide-in.
    await expect.poll(async () => Math.round((await drawer.boundingBox())!.x)).toBe(0);
    // Tab stays inside the drawer.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.sidebar'))).toBe(true);
  });

  test('Escape closes it and focus returns to the menu button', async ({ page }) => {
    await menuButton(page).click();
    await expect(sidebar(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sidebar(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
  });

  test('the close button, a backdrop click and choosing a tool close it', async ({ page }) => {
    await menuButton(page).click();
    await page.getByRole('button', { name: 'Close tools menu' }).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();

    await menuButton(page).click();
    await backdrop(page).click({ position: { x: 580, y: 400 } });
    await expect(sidebar(page)).toBeHidden();

    await menuButton(page).click();
    await jsonLink(page).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
  });
});
