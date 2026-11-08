import type { Page } from '@playwright/test';
import { setCodeMirrorText } from './codemirror';

type Exercise = (page: Page) => Promise<void>;

/** Per-tool "use it for real" steps, used by the no-egress and CSP checks. */
const EXERCISES: Record<string, Exercise> = {
  'json-editor': async (page) => {
    const editor = page.getByTestId('json-editor-view');
    await setCodeMirrorText(editor, '{"items":[{"id":1},{"id":2}]}');
    await page
      .getByRole('toolbar', { name: 'JSON actions' })
      .getByRole('button', { name: 'Format', exact: true })
      .click();
    await page.getByRole('button', { name: 'Schema' }).click();
    await setCodeMirrorText(page.getByTestId('schema-editor'), '{"type":"object"}');
    await page.getByText('Validating').waitFor();
    await editor.getByRole('button', { name: /^tree$/i }).click();
  },
  'json-compare': async (page) => {
    await setCodeMirrorText(page.getByTestId('compare-left'), '{"a":1,"list":[{"id":1}]}');
    await setCodeMirrorText(
      page.getByTestId('compare-right'),
      '{"a":2,"list":[{"id":1},{"id":2}]}',
    );
    await page.getByTestId('compare-summary').filter({ hasText: 'change' }).waitFor();
    await page.getByRole('tab', { name: 'Text diff' }).click();
    await page.getByTestId('text-diff-view').waitFor();
  },
};

export async function exerciseTool(page: Page, toolId: string): Promise<void> {
  await EXERCISES[toolId]?.(page);
}
