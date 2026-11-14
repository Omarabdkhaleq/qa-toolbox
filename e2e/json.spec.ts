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

// Resizable, collapsible split.

const handle = (page: Page) => page.getByRole('separator', { name: 'Resize editors' });

test('dragging near the left edge closes the left pane and keeps the menu and right pane', async ({
  page,
}) => {
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '50');
  const tool = await page.locator('.json-tool').boundingBox();
  const box = await handle(page).boundingBox();
  if (!tool || !box) throw new Error('missing layout');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(tool.x + tool.width * 0.05, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('json-left')).toBeHidden();
  await expect(page.getByTestId('json-right')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Compare controls' })).toBeVisible();
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '0');
});

test('double-click resets the split to 50', async ({ page }) => {
  await handle(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '55');
  await handle(page).dblclick();
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '50');
});

test('keyboard: End closes the right pane, Enter resets, arrows step by 5', async ({ page }) => {
  await handle(page).focus();
  await page.keyboard.press('End');
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByTestId('json-right')).toBeHidden();
  await expect(page.getByTestId('json-left')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByTestId('json-right')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '45');
  await page.keyboard.press('Home');
  await expect(page.getByTestId('json-left')).toBeHidden();
});

test('narrow screens stack the panes and hide the handle', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(handle(page)).toBeHidden();
  const left = await page.getByTestId('json-left').boundingBox();
  const right = await page.getByTestId('json-right').boundingBox();
  if (!left || !right) throw new Error('missing layout');
  expect(right.y).toBeGreaterThanOrEqual(left.y + left.height);
});

test('a closed side leaves the menu and the other pane laid out in their own columns', async ({
  page,
}) => {
  const menu = page.getByRole('group', { name: 'Compare controls' });
  const tool = await page.locator('.json-tool').boundingBox();
  if (!tool) throw new Error('missing layout');

  await handle(page).focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('json-left')).toBeHidden();
  const menu0 = await menu.boundingBox();
  const right0 = await page.getByTestId('json-right').boundingBox();
  if (!menu0 || !right0) throw new Error('missing layout');
  expect(menu0.width).toBeGreaterThan(100);
  expect(menu0.x).toBeLessThan(tool.x + 40);
  expect(right0.x).toBeGreaterThanOrEqual(menu0.x + menu0.width);
  expect(right0.width).toBeGreaterThan(tool.width * 0.6);

  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await expect(page.getByTestId('json-right')).toBeHidden();
  const menu100 = await menu.boundingBox();
  const left100 = await page.getByTestId('json-left').boundingBox();
  if (!menu100 || !left100) throw new Error('missing layout');
  expect(menu100.width).toBeGreaterThan(100);
  expect(left100.x + left100.width).toBeLessThanOrEqual(menu100.x);
  expect(left100.width).toBeGreaterThan(tool.width * 0.6);
  expect(menu100.x + menu100.width).toBeLessThanOrEqual(tool.x + tool.width + 1);
});

// Compare in place. The first block is ported from e2e/json-compare.spec.ts.

const menu = (page: Page) => page.getByRole('group', { name: 'Compare controls' });
const compareBox = (page: Page) => menu(page).getByRole('checkbox', { name: 'Compare' });
const summary = (page: Page) => page.getByTestId('compare-summary');
const position = (page: Page) => page.getByTestId('diff-focus');
const nextChange = (page: Page) => menu(page).getByRole('button', { name: 'Next change' });
const prevChange = (page: Page) => menu(page).getByRole('button', { name: 'Previous change' });
const highlights = (page: Page) => page.locator('[class*="jt-hl"]');
const fillBoth = async (page: Page, left: string, right: string) => {
  await setCodeMirrorText(editor(page), left);
  await setCodeMirrorText(editor(page, 'right'), right);
};
const compare = async (page: Page, left: string, right: string) => {
  await fillBoth(page, left, right);
  await expect(compareBox(page)).toBeEnabled();
  await compareBox(page).check();
};

test('compare: asks for input when empty (Review Focus 4)', async ({ page }) => {
  await expect(compareBox(page)).toBeDisabled();
  await expect(compareBox(page)).not.toBeChecked();
  await expect(compareBox(page)).toHaveAccessibleDescription('Paste JSON on both sides to compare');
});

test('compare: treats reordered keys as identical (Review Focus 5)', async ({ page }) => {
  await compare(page, '{"a":1,"b":2}', '{"b":2,"a":1}');
  await expect(summary(page)).toHaveText('No differences');
});

test('compare: a changed value is counted and focused in both editors', async ({ page }) => {
  await compare(page, '{"user":{"email":"a@x.io"}}', '{"user":{"email":"b@x.io"}}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  await nextChange(page).click();
  await expect(position(page)).toHaveText('Change 1 of 1');
  for (const side of ['left', 'right'] as const) {
    await expect(editor(page, side).locator('.jt-focus')).toHaveCount(1);
    await expect(editor(page, side).locator('.jt-focus')).toContainText('"email"');
  }
});

test('compare: shows reordered items with ids as moves, not changes (Review Focus 5)', async ({
  page,
}) => {
  await compare(
    page,
    '[{"id":1,"n":"a"},{"id":2,"n":"b"},{"id":3,"n":"c"}]',
    '[{"id":3,"n":"c"},{"id":1,"n":"a"},{"id":2,"n":"b"}]',
  );
  await expect(summary(page)).toContainText('0 changed');
  await expect(summary(page)).not.toContainText(' 0 moved');
  await expect(editor(page).locator('.jt-hl--moved').first()).toBeVisible();
  await expect(editor(page, 'right').locator('.jt-hl--moved').first()).toBeVisible();
});

test('compare: detects a one-digit change in a big integer (Review Focus 1)', async ({ page }) => {
  await compare(page, '{"id":12345678901234567890}', '{"id":12345678901234567891}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  await expect(editor(page).locator('.jt-hl--changed')).toContainText('12345678901234567890');
  await expect(editor(page, 'right').locator('.jt-hl--changed')).toContainText(
    '12345678901234567891',
  );
});

test('compare: asks to fix invalid input', async ({ page }) => {
  await fillBoth(page, '{"a":', '{"a":1}');
  await expect(compareBox(page)).toHaveAccessibleDescription('Fix the JSON errors to compare');
  await expect(compareBox(page)).toBeDisabled();
});

test('compare: swaps sides', async ({ page }) => {
  await compare(page, '{"a":1}', '{"a":1,"b":2}');
  await expect(summary(page)).toContainText('1 added');
  await menu(page).getByRole('button', { name: 'Swap sides', exact: true }).click();
  await expect(summary(page)).toContainText('1 removed');
});

test('compare: loads a file into one side', async ({ page }) => {
  await page.getByTestId('file-input-left').setInputFiles('fixtures/bom.json');
  await expect(status(page)).toContainText('Valid JSON');
  await setCodeMirrorText(editor(page, 'right'), '{"source":"windows","ok":true}');
  await expect(compareBox(page)).toBeEnabled();
  await compareBox(page).check();
  await expect(summary(page)).toHaveText('No differences');
});

test('compare: highlights the focused change in the editors and moves it one change at a time', async ({
  page,
}) => {
  // Changed keys a1, b1, c1 are separated by unchanged a2, b2, giving 3 changes.
  await compare(
    page,
    '{"a1":1,"a2":0,"b1":1,"b2":0,"c1":1}',
    '{"a1":2,"a2":0,"b1":2,"b2":0,"c1":2}',
  );
  await expect(summary(page)).toContainText('3 changes');
  const focused = (side: Side) => editor(page, side).locator('.jt-focus');

  await expect(position(page)).toHaveText('3 changes');
  await expect(page.locator('.jt-focus')).toHaveCount(0);

  await nextChange(page).click();
  await expect(position(page)).toHaveText('Change 1 of 3');
  for (const side of ['left', 'right'] as const) {
    await expect(focused(side)).toHaveCount(1); // one line in each editor
    await expect(focused(side)).toContainText('"a1"');
  }

  await nextChange(page).click();
  await expect(position(page)).toHaveText('Change 2 of 3');
  await expect(focused('left')).toContainText('"b1"');
  await expect(focused('right')).toContainText('"b1"');
  await expect(page.locator('.jt-focus', { hasText: '"a1"' })).toHaveCount(0);

  await prevChange(page).click();
  await expect(position(page)).toHaveText('Change 1 of 3');
  await expect(focused('left')).toContainText('"a1"');

  // At the last change, Next stays put.
  await nextChange(page).click();
  await nextChange(page).click();
  await nextChange(page).click();
  await expect(position(page)).toHaveText('Change 3 of 3');
  await expect(focused('left')).toContainText('"c1"');
  await expect(focused('right')).toContainText('"c1"');
});

test('compare: focusing a specific change (Previous from no focus goes to the last)', async ({
  page,
}) => {
  // The Changes drawer adds the click-a-row variant of this test.
  await compare(page, '{"a1":1,"a2":0,"b1":1}', '{"a1":2,"a2":0,"b1":2}');
  await expect(summary(page)).toContainText('2 changes');
  await prevChange(page).click();
  await expect(position(page)).toHaveText('Change 2 of 2');
  await expect(editor(page).locator('.jt-focus').first()).toContainText('"b1"');
  await expect(editor(page, 'right').locator('.jt-focus').first()).toContainText('"b1"');
});

// New compare behaviour.

test('ticking Compare sorts both editors A→Z, each with its own indentation', async ({ page }) => {
  await fillBoth(page, '{"b":1,"a":2}', '{"d":{"y":1,"x":2},"c":3}');
  await toolbar(page, 'right').getByLabel('Indentation').selectOption('4');
  await expect(compareBox(page)).toBeEnabled();
  await compareBox(page).check();
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "a": 2,\n  "b": 1\n}');
  await expect
    .poll(() => readCodeMirrorText(editor(page, 'right')))
    .toBe('{\n    "c": 3,\n    "d": {\n        "x": 2,\n        "y": 1\n    }\n}');
  await compareBox(page).uncheck();
  // Unticking leaves the text sorted.
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "a": 2,\n  "b": 1\n}');
});

test('ticking Compare keeps big integers exact (Review Focus 3)', async ({ page }) => {
  await compare(page, '{"b":12345678901234567890,"a":1}', '{"a":1}');
  await expect.poll(() => readCodeMirrorText(editor(page))).toMatch(/^\{\n {2}"a": 1,/);
  expect(await readCodeMirrorText(editor(page))).toContain('12345678901234567890');
});

test('Compare is unavailable while a side is empty or invalid, and turns off when one breaks (Review Focus 4)', async ({
  page,
}) => {
  await fillBoth(page, '{"a":', '{"a":1}');
  await expect(compareBox(page)).toHaveAccessibleDescription('Fix the JSON errors to compare');
  await expect(compareBox(page)).toBeDisabled();
  expect(await readCodeMirrorText(editor(page))).toBe('{"a":');

  await setCodeMirrorText(editor(page), '{"a":2}');
  await expect(compareBox(page)).toBeEnabled();
  await compareBox(page).check();
  await expect(summary(page)).toContainText('1 changed');
  await expect(highlights(page).first()).toBeVisible();

  await setCodeMirrorText(editor(page), '{"a":');
  await editor(page, 'right').locator('.cm-content').click();
  await expect(compareBox(page)).not.toBeChecked();
  await expect(compareBox(page)).toBeDisabled();
  await expect(highlights(page)).toHaveCount(0);
  await expect(summary(page)).toBeHidden();

  await setCodeMirrorText(editor(page), '');
  await expect(compareBox(page)).toHaveAccessibleDescription('Paste JSON on both sides to compare');
  await expect(compareBox(page)).toBeDisabled();
});

test('typing is never re-sorted; leaving the editor re-sorts it (Review Focus 5)', async ({
  page,
}) => {
  await compare(page, '{"b":1,"c":2}', '{"b":1,"c":3}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "b": 1,\n  "c": 2\n}');

  const content = editor(page).locator('.cm-content');
  await content.click();
  await content.press('ControlOrMeta+End');
  await content.press('ArrowLeft');
  await page.keyboard.insertText(',"a0":1');
  await expect(summary(page)).toHaveText('2 changes: 0 added, 1 removed, 1 changed, 0 moved');
  const typed = await readCodeMirrorText(editor(page));
  expect(typed.indexOf('"a0"')).toBeGreaterThan(typed.indexOf('"c"'));

  await editor(page, 'right').locator('.cm-content').click();
  await expect
    .poll(() => readCodeMirrorText(editor(page)))
    .toBe('{\n  "a0": 1,\n  "b": 1,\n  "c": 2\n}');
});

test('whole-document replacements are sorted while Compare is on', async ({ page }) => {
  await compare(page, '{"a":1}', '{"a":2}');
  await expect(summary(page)).toContainText('1 changed');

  await page.getByTestId('file-input-right').setInputFiles({
    name: 'r.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"z":1,"a":1}'),
  });
  await expect
    .poll(() => readCodeMirrorText(editor(page, 'right')))
    .toBe('{\n  "a": 1,\n  "z": 1\n}');

  await setCodeMirrorText(editor(page), '{"y":1,"a":1}');
  await action(page, 'Format').click();
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "a": 1,\n  "y": 1\n}');

  await setCodeMirrorText(editor(page), '{"q":1,"a":1}');
  await menu(page).getByRole('button', { name: 'Copy left to right', exact: true }).click();
  await expect
    .poll(() => readCodeMirrorText(editor(page, 'right')))
    .toBe('{\n  "a": 1,\n  "q": 1\n}');
  await expect(summary(page)).toHaveText('No differences');
});

test('pasting over the whole document is sorted while Compare is on', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are only scriptable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await compare(page, '{"a":1}', '{"a":2}');
  await expect(summary(page)).toContainText('1 changed');
  await page.evaluate(() => navigator.clipboard.writeText('{"m":1,"b":2}'));
  const content = editor(page).locator('.cm-content');
  await content.click();
  await content.press('ControlOrMeta+a');
  await content.press('ControlOrMeta+v');
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "b": 2,\n  "m": 1\n}');
});

test('a changed value is highlighted in both editors in text view and on its node in tree view', async ({
  page,
}) => {
  await compare(page, '{"keep":1,"val":"old"}', '{"keep":1,"val":"new"}');
  await expect(summary(page)).toContainText('1 changed');
  await expect(editor(page).locator('.cm-line.jt-hl--changed')).toContainText('"val"');
  await expect(editor(page, 'right').locator('.cm-line.jt-hl--changed')).toContainText('"val"');
  await expect(editor(page).locator('.cm-line', { hasText: '"keep"' })).not.toHaveClass(/jt-hl/);

  await editor(page)
    .getByRole('button', { name: /^tree$/i })
    .click();
  await expect(editor(page).locator('.jse-tree-mode')).toBeVisible();
  await expect(editor(page).locator('.jt-hl--changed').first()).toContainText('old');

  await editor(page)
    .getByRole('button', { name: /^text$/i })
    .click();
  await expect(editor(page).locator('.cm-line.jt-hl--changed')).toContainText('"val"');
});

test('unticking Compare removes every highlight and hides the step controls', async ({ page }) => {
  await compare(page, '{"a":1,"b":[1]}', '{"a":2,"c":true}');
  await expect(summary(page)).toContainText('3 changes');
  await nextChange(page).click();
  await expect(position(page)).toHaveText('Change 1 of 3');
  await expect(highlights(page).first()).toBeVisible();
  await expect(page.locator('.jt-focus').first()).toBeVisible();

  await compareBox(page).uncheck();
  await expect(highlights(page)).toHaveCount(0);
  await expect(page.locator('.jt-focus')).toHaveCount(0);
  await expect(position(page)).toBeHidden();
  await expect(nextChange(page)).toBeHidden();
  await expect(prevChange(page)).toBeHidden();
  await expect(summary(page)).toBeHidden();
});

test('table view shows a note instead of highlights and still scrolls to the change', async ({
  page,
}) => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, v: `value-${i}` }));
  const changed = rows.map((r) => (r.id === 170 ? { ...r, v: 'changed-value' } : r));
  await compare(page, JSON.stringify(rows), JSON.stringify(changed));
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  const note = editor(page, 'right')
    .locator('xpath=..')
    .getByText('Differences are highlighted in text and tree views');

  await editor(page, 'right')
    .getByRole('button', { name: /^table$/i })
    .click();
  await expect(editor(page, 'right').locator('.jse-table-mode')).toBeVisible();
  await expect(note).toBeVisible();
  const cell = editor(page, 'right').getByText('changed-value');
  await expect(cell).not.toBeInViewport();
  await nextChange(page).click();
  await expect(position(page)).toHaveText('Change 1 of 1');
  await expect(cell).toBeInViewport();

  await compareBox(page).uncheck();
  await expect(note).toBeHidden();
  await compareBox(page).check();
  await expect(note).toBeVisible();
  await editor(page, 'right')
    .getByRole('button', { name: /^tree$/i })
    .click();
  await expect(note).toBeHidden();
});

test('closing a side disables Compare and keeps its value for when the side reopens', async ({
  page,
}) => {
  await fillBoth(page, '{"a":1}', '{"a":2}');
  await handle(page).focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('json-left')).toBeHidden();
  await expect(compareBox(page)).toBeDisabled();

  await page.keyboard.press('Enter');
  await expect(compareBox(page)).toBeEnabled();
  await compareBox(page).check();
  await expect(summary(page)).toContainText('1 changed');

  await handle(page).focus();
  await page.keyboard.press('End');
  await expect(page.getByTestId('json-right')).toBeHidden();
  await expect(compareBox(page)).toBeDisabled();
  await expect(compareBox(page)).toBeChecked();
  await expect(nextChange(page)).toBeDisabled();

  await page.keyboard.press('Enter');
  await expect(compareBox(page)).toBeEnabled();
  await expect(compareBox(page)).toBeChecked();
  await expect(highlights(page).first()).toBeVisible();
});

test('more than 10,000 changes shows how many are highlighted', async ({ page }) => {
  const doc = (value: number) =>
    JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 10_001 }, (_, i) => [`k${String(i).padStart(5, '0')}`, value]),
      ),
    );
  await compare(page, doc(0), doc(1));
  await expect(summary(page)).toHaveText(
    '10001 changes: 0 added, 0 removed, 10001 changed, 0 moved',
    { timeout: 20_000 },
  );
  await expect(menu(page).getByRole('note')).toHaveText(
    'Highlighting the first 10,000 of 10,001 changes',
  );
});

// Changes drawer

const changesButton = (page: Page) => menu(page).getByRole('button', { name: /^Changes \(/ });
const drawer = (page: Page) => page.getByRole('region', { name: 'Changes' });

test('drawer: the Changes button is disabled while Compare is off', async ({ page }) => {
  await expect(changesButton(page)).toBeDisabled();
  await fillBoth(page, '{"a":1}', '{"a":2}');
  await expect(changesButton(page)).toBeDisabled();
});

test('drawer: lists a change, focuses it on click, closes with Escape and returns focus', async ({
  page,
}) => {
  await compare(page, '{"user":{"email":"a@x.io"}}', '{"user":{"email":"b@x.io"}}');
  await expect(changesButton(page)).toHaveText('Changes (1)');
  await changesButton(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText('$.user.email')).toBeVisible();
  await expect(drawer(page)).toContainText('"a@x.io" → "b@x.io"');
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--drawer-height')),
    )
    .toMatch(/^\d+(\.\d+)?px$/);
  await expect(drawer(page).locator(':focus')).toHaveCount(1);

  await drawer(page)
    .getByRole('button', { name: /\$\.user\.email/ })
    .click();
  await expect(position(page)).toHaveText('Change 1 of 1');
  for (const side of ['left', 'right'] as const) {
    await expect(editor(page, side).locator('.jt-focus')).toHaveCount(1);
  }

  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(changesButton(page)).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--drawer-height')),
    )
    .toBe('');
});

test('drawer: the Close changes button closes it', async ({ page }) => {
  await compare(page, '{"a":1}', '{"a":2}');
  await changesButton(page).click();
  await drawer(page).getByRole('button', { name: 'Close changes' }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(changesButton(page)).toBeFocused();
});

test('drawer: lists moved items and exact big integers', async ({ page }) => {
  await compare(
    page,
    '[{"id":1,"n":"a"},{"id":2,"n":"b"},{"id":3,"n":"c"}]',
    '[{"id":3,"n":"c"},{"id":1,"n":"a"},{"id":2,"n":"b"}]',
  );
  await changesButton(page).click();
  await expect(drawer(page)).toContainText('Moved');
  await page.keyboard.press('Escape');
  await compareBox(page).uncheck();
  await compare(page, '{"id":12345678901234567890}', '{"id":12345678901234567891}');
  await changesButton(page).click();
  await expect(drawer(page)).toContainText('12345678901234567890 → 12345678901234567891');
});

test('drawer: jumping from a row focuses that change in both editors', async ({ page }) => {
  await compare(page, '{"a1":1,"a2":0,"b1":1}', '{"a1":2,"a2":0,"b1":2}');
  await expect(summary(page)).toContainText('2 changes');
  await changesButton(page).click();
  await drawer(page)
    .getByRole('list', { name: 'Changes' })
    .getByRole('button', { name: /\$\.b1/ })
    .click();
  await expect(position(page)).toHaveText('Change 2 of 2');
  for (const side of ['left', 'right'] as const) {
    await expect(editor(page, side).locator('.jt-focus')).toContainText('"b1"');
  }
});

// Compare pauses while the user types invalid JSON; the drawer follows Compare and never hides the focus.

const startPausable = async (page: Page) => {
  await compare(page, '{"a":1}', '{"a":2}');
  await expect(summary(page)).toContainText('1 changed');
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "a": 1\n}');
};
const typeBeforeLeftClosingBrace = async (page: Page, text: string) => {
  const content = editor(page).locator('.cm-content');
  await content.click();
  await content.press('ControlOrMeta+End');
  await content.press('ArrowLeft');
  await page.keyboard.type(text);
};

test('typing invalid JSON pauses Compare; valid again resumes it without re-ticking', async ({
  page,
}) => {
  await startPausable(page);
  await typeBeforeLeftClosingBrace(page, ',"b"');
  await expect(menu(page).getByText('Fix the JSON errors to compare')).toBeVisible({
    timeout: 1000,
  });
  await expect(highlights(page)).toHaveCount(0, { timeout: 1000 });
  await expect(compareBox(page)).toBeChecked();

  await page.keyboard.type(':3');
  await expect(editor(page).locator('.jt-hl--changed').first()).toBeVisible();
  await expect(compareBox(page)).toBeChecked();
  await expect(summary(page)).toContainText('1 changed');
});

test('leaving the editor while its JSON is invalid turns Compare off', async ({ page }) => {
  await startPausable(page);
  await typeBeforeLeftClosingBrace(page, ',"b"');
  await expect(menu(page).getByText('Fix the JSON errors to compare')).toBeVisible();
  await expect(compareBox(page)).toBeChecked();
  await editor(page, 'right').locator('.cm-content').click();
  await expect(compareBox(page)).not.toBeChecked();
});

test('emptying the focused editor pauses Compare until focus leaves it', async ({ page }) => {
  await startPausable(page);
  const content = editor(page).locator('.cm-content');
  await content.click();
  await content.press('ControlOrMeta+a');
  await content.press('Delete');
  await expect(menu(page).getByText('Paste JSON on both sides to compare')).toBeVisible();
  await expect(compareBox(page)).toBeChecked();
  await expect(highlights(page)).toHaveCount(0);
  await editor(page, 'right').locator('.cm-content').click();
  await expect(compareBox(page)).not.toBeChecked();
});

test('an invalid file loaded while Compare is on turns it off immediately', async ({ page }) => {
  await startPausable(page);
  await editor(page).locator('.cm-content').click();
  await page.getByTestId('file-input-left').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"a":'),
  });
  await expect(compareBox(page)).not.toBeChecked();
});

test('the drawer closes when Compare pauses and does not come back on its own', async ({
  page,
}) => {
  await startPausable(page);
  await changesButton(page).click();
  await expect(drawer(page)).toBeVisible();
  await typeBeforeLeftClosingBrace(page, ',"b"');
  await expect(drawer(page)).toHaveCount(0);
  await page.keyboard.type(':3');
  await expect(editor(page).locator('.jt-hl--changed').first()).toBeVisible();
  await expect(changesButton(page)).toBeEnabled();
  await expect(drawer(page)).toHaveCount(0);
});

test('with the drawer open, a focused change on the last line stays above the drawer', async ({
  page,
}) => {
  const doc = (last: number) =>
    JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [
          `k${String(i).padStart(3, '0')}`,
          i === 99 ? last : i,
        ]),
      ),
    );
  await compare(page, doc(99), doc(-1));
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  await changesButton(page).click();
  await drawer(page)
    .getByRole('button', { name: /\$\.k099/ })
    .click();
  await expect(position(page)).toHaveText('Change 1 of 1');
  const drawerBox = await drawer(page).boundingBox();
  if (!drawerBox) throw new Error('missing drawer');
  for (const side of ['left', 'right'] as const) {
    const line = editor(page, side).locator('.jt-focus');
    await expect(line).toContainText('"k099"');
    await expect
      .poll(async () => {
        const box = await line.boundingBox();
        return box ? box.y + box.height : Infinity;
      })
      .toBeLessThanOrEqual(drawerBox.y);
  }
});

// Commands, Ctrl+Alt+↓/↑ and the keyboard reference (Task 10).

const pretendOs = (page: Page, platform: 'MacIntel' | 'Win32') =>
  page.addInitScript((p) => {
    Object.defineProperty(navigator, 'platform', { get: () => p });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  }, platform);
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const paletteRow = (page: Page, name: string) =>
  palette(page).getByRole('option').filter({ hasText: name });
const openPalette = async (page: Page, query: string) => {
  await page.getByRole('button', { name: 'Commands and shortcuts' }).click();
  await palette(page).getByRole('combobox').fill(query);
};

test('Ctrl+Alt+ArrowDown steps to the next change from inside an editor without adding a cursor', async ({
  page,
}) => {
  await pretendOs(page, 'Win32');
  await page.reload();
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await compare(page, '{"a":1,"b":2}', '{"a":9,"b":8}');
  await expect(summary(page)).toContainText('2 changed');
  await editor(page).locator('.cm-content').click();
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(position(page)).toHaveText('Change 1 of 2');
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(position(page)).toHaveText('Change 2 of 2');
  await page.keyboard.press('Control+Alt+ArrowUp');
  await expect(position(page)).toHaveText('Change 1 of 2');
  await expect(editor(page).locator('.cm-cursor')).toHaveCount(1);
});

test('Ctrl+Alt+ArrowDown is left to the editor while Compare is off', async ({ page }) => {
  await pretendOs(page, 'Win32');
  await page.reload();
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await fillBoth(page, '{"a":1}\n{"a":1}', '{"a":2}');
  await editor(page).locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(position(page)).toHaveCount(0);
  await expect(editor(page).locator('.cm-cursor')).toHaveCount(2);
  await expect(compareBox(page)).not.toBeChecked();
});

test('the palette lists Next change with its shortcut, per OS', async ({ page }) => {
  await pretendOs(page, 'Win32');
  await page.reload();
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await openPalette(page, 'next change');
  await expect(paletteRow(page, 'Next change')).toContainText('Ctrl+Alt+↓');
  await expect(paletteRow(page, 'Next change')).toContainText('Turn on Compare first');
});

test('the palette lists Next change as ⌃⌥↓ on macOS', async ({ page }) => {
  await pretendOs(page, 'MacIntel');
  await page.reload();
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await openPalette(page, 'next change');
  await expect(paletteRow(page, 'Next change')).toContainText('⌃⌥↓');
});

test('running Format left from the palette by mouse formats the left editor', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"b":1,"a":2}');
  await openPalette(page, 'format left');
  await paletteRow(page, 'Format left').click();
  await expect(palette(page)).toHaveCount(0);
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "b": 1,\n  "a": 2\n}');
  expect((await readCodeMirrorText(editor(page, 'right'))).trim()).toBe('');
});

test('a palette command run with Enter changes the split', async ({ page }) => {
  await openPalette(page, 'close left');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('json-left')).toBeHidden();
});

test('the keyboard reference lists split and editor keys as read-only rows', async ({ page }) => {
  await pretendOs(page, 'Win32');
  await page.reload();
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await openPalette(page, 'undo');
  await expect(paletteRow(page, 'Undo')).toContainText('Ctrl+Z');
  await expect(paletteRow(page, 'Undo')).toContainText('Keyboard reference');
  await palette(page).getByRole('combobox').fill('add cursor below');
  await expect(paletteRow(page, 'Add cursor below')).toContainText('Ctrl+Alt+↓');
  await expect(paletteRow(page, 'Add cursor below')).toContainText('Ubuntu');
  await palette(page).getByRole('combobox').fill('split handle');
  await expect(palette(page).getByRole('option')).toHaveCount(5);
});

test('the Next change button tooltip contains the shortcut', async ({ page }) => {
  await pretendOs(page, 'Win32');
  await page.reload();
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await compare(page, '{"a":1}', '{"a":2}');
  await expect(nextChange(page)).toHaveAttribute('title', 'Next change (Ctrl+Alt+↓)');
  await expect(prevChange(page)).toHaveAttribute('title', 'Previous change (Ctrl+Alt+↑)');
});

// Final review fixes.

test('inside arrays each editor highlights and focuses its own copy of the changed item', async ({
  page,
}) => {
  await compare(
    page,
    '{"items":[{"id":1,"n":"a"},{"id":2,"n":"b"},{"id":4,"n":"d"}]}',
    '{"items":[{"id":3,"n":"c"},{"id":1,"n":"a"},{"id":2,"n":"B"}]}',
  );
  await expect(summary(page)).toHaveText('3 changes: 1 added, 1 removed, 1 changed, 0 moved');
  const changedLeft = editor(page).locator('.cm-line.jt-hl--changed');
  const changedRight = editor(page, 'right').locator('.cm-line.jt-hl--changed');
  await expect(changedLeft).toHaveCount(1);
  await expect(changedLeft).toHaveText('      "n": "b"');
  await expect(changedRight).toHaveCount(1);
  await expect(changedRight).toHaveText('      "n": "B"');
  await expect(editor(page).locator('.cm-line.jt-hl--removed', { hasText: '"id": 4' })).toHaveCount(
    1,
  );
  await expect(
    editor(page).locator('.cm-line.jt-hl--removed', { hasText: '"n": "d"' }),
  ).toHaveCount(1);
  await expect(
    editor(page, 'right').locator('.cm-line.jt-hl--added', { hasText: '"id": 3' }),
  ).toHaveCount(1);

  await nextChange(page).click();
  await nextChange(page).click();
  await expect(position(page)).toHaveText('Change 2 of 3');
  await expect(editor(page).locator('.jt-focus')).toHaveText('      "n": "b"');
  await expect(editor(page, 'right').locator('.jt-focus')).toHaveText('      "n": "B"');
});

test('a change in a longer right-hand array is still highlighted and focused on the left', async ({
  page,
}) => {
  await compare(page, '[{"id":2,"n":"b"}]', '[{"id":3},{"id":2,"n":"B"}]');
  await expect(summary(page)).toHaveText('2 changes: 1 added, 0 removed, 1 changed, 0 moved');
  await expect(editor(page).locator('.cm-line.jt-hl--changed')).toHaveText('    "n": "b"');
  await expect(editor(page, 'right').locator('.cm-line.jt-hl--changed')).toHaveText('    "n": "B"');
  await nextChange(page).click();
  await nextChange(page).click();
  await expect(editor(page).locator('.jt-focus')).toHaveText('    "n": "b"');
});

test('clicking the pane’s Repair while Compare is paused keeps Compare on and resumes it', async ({
  page,
}) => {
  await startPausable(page);
  await typeBeforeLeftClosingBrace(page, ",'b':2");
  await expect(menu(page).getByText('Fix the JSON errors to compare')).toBeVisible();
  await expect(compareBox(page)).toBeChecked();
  // A real click holds the button down for a moment; the editor's blur lands before the click.
  await action(page, 'Repair').click({ delay: 200 });
  await expect(status(page)).toContainText('Valid JSON');
  await expect(summary(page)).toHaveText('2 changes: 0 added, 1 removed, 1 changed, 0 moved');
  await expect(compareBox(page)).toBeChecked();
  await expect(editor(page).locator('.cm-line.jt-hl--changed').first()).toBeVisible();
});

test('clicking the editor’s own Undo while Compare is paused keeps Compare on', async ({
  page,
}) => {
  await startPausable(page);
  const content = editor(page).locator('.cm-content');
  await content.click();
  await content.press('ControlOrMeta+End');
  await content.press('ArrowLeft');
  await page.keyboard.insertText(',"b"');
  await expect(menu(page).getByText('Fix the JSON errors to compare')).toBeVisible();
  await editor(page).getByRole('button', { name: /^Undo/ }).click({ delay: 200 });
  await expect.poll(() => readCodeMirrorText(editor(page))).toBe('{\n  "a": 1\n}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  await expect(compareBox(page)).toBeChecked();
});

test('value colours come from the theme tokens in light and dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await setCodeMirrorText(editor(page), '{"n":1,"s":"x","b":true,"z":null}');
  await editor(page)
    .getByRole('button', { name: /^tree$/i })
    .click();
  const colorOf = (selector: string) =>
    editor(page)
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).color);
  const token = (name: string) =>
    page.evaluate((n) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${n})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }, name);
  for (const theme of ['light', 'dark'] as const) {
    if (theme === 'dark') {
      await page.getByLabel('Theme').selectOption('dark');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    }
    await expect.poll(() => colorOf('.jse-value.jse-number')).toBe(await token('--json-number'));
    await expect.poll(() => colorOf('.jse-value.jse-string')).toBe(await token('--json-string'));
    await expect.poll(() => colorOf('.jse-value.jse-boolean')).toBe(await token('--json-boolean'));
    await expect.poll(() => colorOf('.jse-value.jse-null')).toBe(await token('--json-null'));
  }
});

test('each side’s schema panel has its own accessible name', async ({ page }) => {
  await action(page, 'Schema').click();
  await action(page, 'Schema', 'right').click();
  await expect(page.getByRole('complementary', { name: 'Left JSON Schema' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Right JSON Schema' })).toBeVisible();
});

// Two grip handles, one on each side of the middle menu.

const leftGrip = (page: Page) => page.getByRole('separator', { name: 'Resize editors' });
const rightGrip = (page: Page) => page.getByTestId('split-handle-right');
const paneWidths = async (page: Page) => {
  const l = await page.getByTestId('json-left').boundingBox();
  const r = await page.getByTestId('json-right').boundingBox();
  if (!l || !r) throw new Error('missing layout');
  return { left: l.width, right: r.width };
};
const dragFrom = async (page: Page, startX: number, y: number, toX: number) => {
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 8 });
  await page.mouse.up();
};

test('both handles are 16 px wide hit zones on either side of the menu', async ({ page }) => {
  const menuBox = (await page.getByRole('group', { name: 'Compare controls' }).boundingBox())!;
  const l = (await leftGrip(page).boundingBox())!;
  const r = (await rightGrip(page).boundingBox())!;
  expect(l.width).toBe(16);
  expect(r.width).toBe(16);
  expect(l.x + l.width / 2).toBeLessThan(menuBox.x + 12);
  expect(r.x + r.width / 2).toBeGreaterThan(menuBox.x + menuBox.width - 12);
  await expect(page.getByRole('separator')).toHaveCount(1);
});

test('dragging the right handle to 70% makes the left pane wider', async ({ page }) => {
  const tool = (await page.locator('.json-tool').boundingBox())!;
  const box = (await rightGrip(page).boundingBox())!;
  await dragFrom(page, box.x + box.width / 2, box.y + box.height / 2, tool.x + tool.width * 0.7);
  const w = await paneWidths(page);
  expect(w.left).toBeGreaterThan(w.right);
  await expect(leftGrip(page)).toHaveAttribute('aria-valuenow', /^(6|7)\d$/);
});

test('dragging the left handle to 30% makes the left pane narrower', async ({ page }) => {
  const tool = (await page.locator('.json-tool').boundingBox())!;
  const box = (await leftGrip(page).boundingBox())!;
  await dragFrom(page, box.x + box.width / 2, box.y + box.height / 2, tool.x + tool.width * 0.3);
  const w = await paneWidths(page);
  expect(w.left).toBeLessThan(w.right);
});

test('a pointer-down 6 px beside the visible bar still drags', async ({ page }) => {
  const tool = (await page.locator('.json-tool').boundingBox())!;
  const box = (await rightGrip(page).boundingBox())!;
  await dragFrom(
    page,
    box.x + box.width / 2 + 6,
    box.y + box.height / 2,
    tool.x + tool.width * 0.7,
  );
  const w = await paneWidths(page);
  expect(w.left).toBeGreaterThan(w.right);
});

test('a right-click on a handle does not start a drag', async ({ page }) => {
  const tool = (await page.locator('.json-tool').boundingBox())!;
  const box = (await rightGrip(page).boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(tool.x + tool.width * 0.7, y, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await expect(leftGrip(page)).toHaveAttribute('aria-valuenow', '50');
});

test('double-clicking the right handle resets the split', async ({ page }) => {
  await leftGrip(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(leftGrip(page)).toHaveAttribute('aria-valuenow', '55');
  await rightGrip(page).dblclick();
  await expect(leftGrip(page)).toHaveAttribute('aria-valuenow', '50');
});

test('the body is not text-selectable while dragging', async ({ page }) => {
  const box = (await rightGrip(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveClass(/is-resizing/);
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/is-resizing/);
});

// Collapsed arrays show how many items they hold (text view).

// Clicks the fold arrow on the editor line containing `text` (the fold gutter only renders
// elements for foldable lines, so it is matched by vertical position, not by index).
async function foldLine(page: Page, text: string, side: Side = 'left') {
  const line = await editor(page, side)
    .locator('.cm-line', { hasText: text })
    .first()
    .boundingBox();
  const markers = editor(page, side).locator('.cm-foldGutter .cm-gutterElement');
  for (let i = 0; i < (await markers.count()); i++) {
    const box = await markers.nth(i).boundingBox();
    if (box && line && Math.abs(box.y + box.height / 2 - (line.y + line.height / 2)) < 4) {
      await markers.nth(i).locator('span').click();
      return;
    }
  }
  throw new Error(`No fold marker on the line with ${text}`);
}

test('a collapsed array in text view shows its item count', async ({ page }) => {
  await setCodeMirrorText(
    editor(page),
    '{\n  "list": [\n    1,\n    {"a": [2, 3]},\n    "x"\n  ],\n  "obj": {\n    "k": 1\n  }\n}',
  );
  await foldLine(page, '"list"');
  await expect(editor(page).locator('.cm-foldPlaceholder')).toHaveText('… 3 items');
  await expect(editor(page).locator('.cm-foldPlaceholder')).toHaveAttribute(
    'aria-label',
    'Folded array, 3 items',
  );
  await editor(page).locator('.cm-foldPlaceholder').click();
  await expect(editor(page).locator('.cm-foldPlaceholder')).toHaveCount(0);
});

test('a collapsed object keeps the plain marker and the count survives a tree round trip', async ({
  page,
}) => {
  await setCodeMirrorText(
    editor(page),
    '{\n  "obj": {\n    "k": 1\n  },\n  "one": [\n    true\n  ]\n}',
  );
  // Move focus out of the editor first: switching tree → text while the text editor still had
  // focus when entering tree view is a separate known bug, not what this test covers.
  await status(page).click();
  await editor(page)
    .getByRole('button', { name: /^tree$/i })
    .click();
  await expect(editor(page).getByRole('treeitem', { name: /^one : \[/ })).toBeVisible();
  await editor(page)
    .getByRole('button', { name: /^text$/i })
    .click();
  await expect(editor(page).locator('.cm-content')).toBeVisible();
  await foldLine(page, '"one"');
  await foldLine(page, '"obj"');
  await expect(editor(page).locator('.cm-foldPlaceholder')).toHaveText(['…', '… 1 item']);
});

// Editable editor titles name the downloaded file.

const title = (page: Page, side: Side = 'left') =>
  page.getByRole('textbox', { name: `${Cap(side)} editor title` });

test('each editor has an empty title with a placeholder', async ({ page }) => {
  await expect(title(page)).toHaveValue('');
  await expect(title(page)).toHaveAttribute('placeholder', 'Left: untitled');
  await expect(title(page, 'right')).toHaveAttribute('placeholder', 'Right: untitled');
});

test('downloads use the editor title as the file name', async ({ page }) => {
  await setCodeMirrorText(editor(page, 'right'), '[1]');
  await title(page, 'right').fill('orders/2024');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    action(page, 'Download', 'right').click(),
  ]);
  expect(download.suggestedFilename()).toBe('orders-2024.json');
});

test('opening a file sets the title to its file name', async ({ page }) => {
  await page.getByTestId('file-input-left').setInputFiles('fixtures/bom.json');
  await expect(status(page)).toContainText('Valid JSON');
  await expect(title(page)).toHaveValue('bom.json');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    action(page, 'Download').click(),
  ]);
  expect(download.suggestedFilename()).toBe('bom.json');
});

test('Swap sides swaps the titles; Copy leaves them alone', async ({ page }) => {
  await setCodeMirrorText(editor(page), '{"a":1}');
  await setCodeMirrorText(editor(page, 'right'), '{"b":2}');
  await title(page).fill('first');
  await title(page, 'right').fill('second');
  const menu = page.getByRole('group', { name: 'Compare controls' });
  await menu.getByRole('button', { name: 'Swap sides', exact: true }).click();
  await expect(title(page)).toHaveValue('second');
  await expect(title(page, 'right')).toHaveValue('first');
  await menu.getByRole('button', { name: 'Copy left to right', exact: true }).click();
  await expect(title(page)).toHaveValue('second');
  await expect(title(page, 'right')).toHaveValue('first');
});
