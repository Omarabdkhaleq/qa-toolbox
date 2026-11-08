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
};

export async function exerciseTool(page: Page, toolId: string): Promise<void> {
  await EXERCISES[toolId]?.(page);
}
