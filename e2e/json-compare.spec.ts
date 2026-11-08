import { expect, test, type Page } from '@playwright/test';
import { setCodeMirrorText } from './support/codemirror';

const summary = (page: Page) => page.getByTestId('compare-summary');
const fill = async (page: Page, left: string, right: string) => {
  await setCodeMirrorText(page.getByTestId('compare-left'), left);
  await setCodeMirrorText(page.getByTestId('compare-right'), right);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/json-compare');
  await expect(page.getByTestId('compare-left').locator('.cm-content')).toBeVisible();
});

test('asks for input when empty (Review Focus 4)', async ({ page }) => {
  await expect(summary(page)).toHaveText('Paste JSON on both sides to compare');
});

test('treats reordered keys as identical unless key order matters (Review Focus 5)', async ({
  page,
}) => {
  await fill(page, '{"a":1,"b":2}', '{"b":2,"a":1}');
  await expect(summary(page)).toHaveText('No differences');
  await page.getByLabel('Ignore key order').uncheck();
  await expect(summary(page)).toHaveText('Same data — key order or number notation differs');
});

test('lists a changed value by path and jumps to it in the text diff', async ({ page }) => {
  await fill(page, '{"user":{"email":"a@x.io"}}', '{"user":{"email":"b@x.io"}}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  const item = page.getByRole('list', { name: 'Changes' }).getByRole('button');
  await expect(item).toContainText('$.user.email');
  await expect(item).toContainText('"a@x.io" → "b@x.io"');
  await item.click();
  await expect(page.getByRole('tab', { name: 'Text diff' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('text-diff-view').locator('.cm-mergeView')).toBeVisible();
  await page.getByRole('button', { name: 'Next change' }).click();
});

test('shows reordered items with ids as moves, not changes (Review Focus 5)', async ({ page }) => {
  await fill(
    page,
    '[{"id":1,"n":"a"},{"id":2,"n":"b"},{"id":3,"n":"c"}]',
    '[{"id":3,"n":"c"},{"id":1,"n":"a"},{"id":2,"n":"b"}]',
  );
  await expect(summary(page)).toContainText('0 changed');
  await expect(page.getByRole('list', { name: 'Changes' })).toContainText('Moved');
});

test('detects a one-digit change in a big integer (Review Focus 1)', async ({ page }) => {
  await fill(page, '{"id":12345678901234567890}', '{"id":12345678901234567891}');
  await expect(summary(page)).toHaveText('1 change: 0 added, 0 removed, 1 changed, 0 moved');
  await expect(page.getByRole('list', { name: 'Changes' })).toContainText(
    '12345678901234567890 → 12345678901234567891',
  );
});

test('asks to fix invalid input', async ({ page }) => {
  await fill(page, '{"a":', '{"a":1}');
  await expect(summary(page)).toHaveText('Fix the JSON errors to compare');
});

test('swaps sides', async ({ page }) => {
  await fill(page, '{"a":1}', '{"a":1,"b":2}');
  await expect(summary(page)).toContainText('1 added');
  await page.getByRole('button', { name: 'Swap sides' }).click();
  await expect(summary(page)).toContainText('1 removed');
});

test('loads a file into one side', async ({ page }) => {
  await page.getByTestId('file-input-left').setInputFiles('fixtures/bom.json');
  await setCodeMirrorText(page.getByTestId('compare-right'), '{"source":"windows","ok":true}');
  await expect(summary(page)).toHaveText('No differences');
});

test('highlights the focused change in the text diff and moves it one change at a time', async ({
  page,
}) => {
  // Changed keys a1, b1, c1 are separated by unchanged a2, b2 (after key sorting), giving 3 changes.
  await fill(page, '{"a1":1,"a2":0,"b1":1,"b2":0,"c1":1}', '{"a1":2,"a2":0,"b1":2,"b2":0,"c1":2}');
  await expect(summary(page)).toContainText('3 changes');
  await page.getByRole('tab', { name: 'Text diff' }).click();

  const diff = page.getByTestId('text-diff-view');
  const focused = diff.locator('.cm-focusChunk');
  const position = page.getByTestId('diff-focus');
  const next = page.getByRole('button', { name: 'Next change' });
  const prev = page.getByRole('button', { name: 'Previous change' });

  await expect(position).toHaveText('3 changes');
  await expect(focused).toHaveCount(0);

  await next.click();
  await expect(position).toHaveText('Change 1 of 3');
  await expect(focused).toHaveCount(2); // one line in each pane
  await expect(focused.first()).toContainText('"a1"');

  await next.click();
  await expect(position).toHaveText('Change 2 of 3');
  await expect(focused).toHaveCount(2);
  await expect(focused.first()).toContainText('"b1"');
  await expect(diff.locator('.cm-focusChunk', { hasText: '"a1"' })).toHaveCount(0);

  await prev.click();
  await expect(position).toHaveText('Change 1 of 3');
  await expect(focused.first()).toContainText('"a1"');

  // At the last change, Next stays put.
  await next.click();
  await next.click();
  await next.click();
  await expect(position).toHaveText('Change 3 of 3');
  await expect(focused.first()).toContainText('"c1"');
});

test('jumping from the Changes tab focuses that change in the text diff', async ({ page }) => {
  await fill(page, '{"a1":1,"a2":0,"b1":1}', '{"a1":2,"a2":0,"b1":2}');
  await expect(summary(page)).toContainText('2 changes');
  await page
    .getByRole('list', { name: 'Changes' })
    .getByRole('button', { name: /\$\.b1/ })
    .click();
  await expect(page.getByTestId('diff-focus')).toHaveText('Change 2 of 2');
  await expect(page.getByTestId('text-diff-view').locator('.cm-focusChunk').first()).toContainText(
    '"b1"',
  );
});
