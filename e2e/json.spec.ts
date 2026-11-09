import { expect, test, type Page } from '@playwright/test';
import { readCodeMirrorText, setCodeMirrorText } from './support/codemirror';

type Side = 'left' | 'right';
const Cap = (s: Side) => (s === 'left' ? 'Left' : 'Right');

const editor = (page: Page, side: Side = 'left') => page.getByTestId(`json-editor-${side}`);
const status = (page: Page, side: Side = 'left') => page.getByTestId(`status-${side}`);
const toolbar = (page: Page, side: Side = 'left') =>
  page.getByRole('toolbar', { name: `${Cap(side)} JSON actions` });
const action = (page: Page, name: string, side: Side = 'left') =>
  toolbar(page, side).getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/json');
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await expect(editor(page, 'right').locator('.cm-content')).toBeVisible();
});

// Ported from e2e/json-editor.spec.ts onto the left pane.

test('starts empty with a neutral status (Review Focus 4)', async ({ page }) => {
  await expect(status(page)).toHaveText('Empty — paste, type, or drop a JSON file');
});

test('formats with 4 spaces, minifies, and sorts keys', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"b":1,"a":[1,2]}');
  await toolbar(page).getByLabel('Indentation').selectOption('4');
  await action(page, 'Format').click();
  await expect
    .poll(() => readCodeMirrorText(editor(page)))
    .toBe('{\n    "b": 1,\n    "a": [\n        1,\n        2\n    ]\n}');

  await action(page, 'Minify').click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{"b":1,"a":[1,2]}');

  await action(page, 'Sort keys').click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toMatch(/^\{\n {4}"a": \[/);
  await expect(status(page)).toHaveText(/^Valid JSON · \d+ B · 5 nodes$/);
});

test('keeps big integers exact through formatting (Review Focus 1)', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"id":12345678901234567890}');
  await action(page, 'Format').click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toContain('"id": 12345678901234567890');
});

test('shows parse errors with position and repairs them', async ({ page }) => {
  await setCodeMirrorText(editor(page), "{a: 'x',}");
  await expect(status(page)).toContainText('Invalid JSON');
  await expect(status(page)).toContainText('line 1');
  await action(page, 'Format').click();
  await expect(page.getByRole('alert').filter({ hasText: "Can't format" })).toBeVisible();
  await action(page, 'Repair').click();
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
  await action(page, 'Schema').click();
  await setCodeMirrorText(
    page.getByTestId('schema-editor-left'),
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
  await page.getByTestId('file-input-left').setInputFiles('fixtures/bom.json');
  await expect(status(page)).toContainText('Valid JSON');
  await expect.poll(() => readCodeMirrorText(editor(page))).toContain('"source": "windows"');
});

test('rejects a binary file with a message (Review Focus 2)', async ({ page }) => {
  await page.getByTestId('file-input-left').setInputFiles({
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
    action(page, 'Download').click(),
  ]);
  expect(download.suggestedFilename()).toBe('document.json');
});

test('copies to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are only scriptable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setCodeMirrorText(editor(page), '{"copied":true}');
  await action(page, 'Copy').click();
  await expect(page.getByText('Copied to clipboard')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('{"copied":true}');
});

// New in the two-pane shell.

test('the right pane formats independently of the left', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"l":1}');
  await setCodeMirrorText(editor(page, 'right'), '{"r":[1]}');
  await action(page, 'Format', 'right').click();
  await expect
    .poll(() => readCodeMirrorText(editor(page, 'right')))
    .toBe('{\n  "r": [\n    1\n  ]\n}');
  expect(await readCodeMirrorText(editor(page))).toBe('{"l":1}');
  await expect(status(page, 'right')).toContainText('Valid JSON');
});

test('Swap sides exchanges the two texts', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"l":1}');
  await setCodeMirrorText(editor(page, 'right'), '{"r":2}');
  await page
    .getByRole('group', { name: 'Compare controls' })
    .getByRole('button', { name: 'Swap sides', exact: true })
    .click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{"r":2}');
  await expect.poll(() => readCodeMirrorText(editor(page, 'right'))).toBe('{"l":1}');
});

test('Copy left to right and right to left copy the raw text', async ({ page }) => {
  const menu = page.getByRole('group', { name: 'Compare controls' });
  await setCodeMirrorText(editor(page), '{"l":   1}');
  await menu.getByRole('button', { name: 'Copy left to right', exact: true }).click();
  await expect.poll(() => readCodeMirrorText(editor(page, 'right'))).toBe('{"l":   1}');
  await setCodeMirrorText(editor(page, 'right'), '[ 2 ]');
  await menu.getByRole('button', { name: 'Copy right to left', exact: true }).click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('[ 2 ]');
});

test('a comment shows the Repair hint and Repair removes it', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"a":1 // c}');
  await expect(status(page)).toContainText("Comments aren't supported yet. Click Repair");
  await action(page, 'Repair').click();
  await expect(status(page)).toContainText('Valid JSON');
});
