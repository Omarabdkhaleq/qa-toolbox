import { expect, test, type Page } from '@playwright/test';
import { readCodeMirrorText, setCodeMirrorText } from './support/codemirror';

const editor = (page: Page) => page.getByTestId('json-editor-view');
const status = (page: Page) => page.getByTestId('status-bar');

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/json-editor');
  await expect(editor(page).locator('.cm-content')).toBeVisible();
});

test('starts empty with a neutral status (Review Focus 4)', async ({ page }) => {
  await expect(status(page)).toHaveText('Empty — paste, type, or drop a JSON file');
});

test('formats with 4 spaces, minifies, and sorts keys', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"b":1,"a":[1,2]}');
  await page.getByLabel('Indentation').selectOption('4');
  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Format', exact: true })
    .click();
  await expect
    .poll(() => readCodeMirrorText(editor(page)))
    .toBe('{\n    "b": 1,\n    "a": [\n        1,\n        2\n    ]\n}');

  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Minify', exact: true })
    .click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{"b":1,"a":[1,2]}');

  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Sort keys', exact: true })
    .click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toMatch(/^\{\n {4}"a": \[/);
  await expect(status(page)).toHaveText(/^Valid JSON · \d+ B · 5 nodes$/);
});

test('keeps big integers exact through formatting (Review Focus 1)', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"id":12345678901234567890}');
  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Format', exact: true })
    .click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toContain('"id": 12345678901234567890');
});

test('shows parse errors with position and repairs them', async ({ page }) => {
  await setCodeMirrorText(editor(page), "{a: 'x',}");
  await expect(status(page)).toContainText('Invalid JSON');
  await expect(status(page)).toContainText('line 1');
  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Format', exact: true })
    .click();
  await expect(page.getByRole('alert').filter({ hasText: "Can't format" })).toBeVisible();
  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Repair', exact: true })
    .click();
  await expect(status(page)).toContainText('Valid JSON');
});

test('switches to tree mode', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"a":{"b":1}}');
  await editor(page)
    .getByRole('button', { name: /^tree$/i })
    .click();
  await expect(editor(page).locator('.jse-tree-mode')).toBeVisible();
});

test('validates against a JSON Schema', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"age":"old"}');
  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Schema', exact: true })
    .click();
  await setCodeMirrorText(
    page.getByTestId('schema-editor'),
    '{"type":"object","properties":{"age":{"type":"number"}}}',
  );
  await expect(page.getByText('Validating')).toBeVisible();
  await expect(
    editor(page)
      .getByText(/number/i)
      .first(),
  ).toBeVisible();
});

test('opens a file that starts with a BOM (Review Focus 2)', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles('fixtures/bom.json');
  await expect(status(page)).toContainText('Valid JSON');
  await expect.poll(() => readCodeMirrorText(editor(page))).toContain('"source": "windows"');
});

test('rejects a binary file with a message (Review Focus 2)', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0x1a]),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'binary file' })).toBeVisible();
});

test('downloads the document', async ({ page }) => {
  await setCodeMirrorText(editor(page), '[1]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('toolbar', { name: 'JSON actions' })
      .getByRole('button', { name: 'Download', exact: true })
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe('document.json');
});

test('copies to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are only scriptable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setCodeMirrorText(editor(page), '{"copied":true}');
  await page
    .getByRole('toolbar', { name: 'JSON actions' })
    .getByRole('button', { name: 'Copy', exact: true })
    .click();
  await expect(page.getByText('Copied to clipboard')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('{"copied":true}');
});
