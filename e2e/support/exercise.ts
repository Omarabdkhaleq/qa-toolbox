import type { Page } from '@playwright/test';
import { setCodeMirrorText } from './codemirror';

type Exercise = (page: Page) => Promise<void>;

/** Per-tool "use it for real" steps, used by the no-egress and CSP checks. */
const EXERCISES: Record<string, Exercise> = {
  json: async (page) => {
    const editor = page.getByTestId('json-editor-left');
    await setCodeMirrorText(editor, '{"items":[{"id":1},{"id":2}]}');
    await page
      .getByRole('toolbar', { name: 'Left JSON actions' })
      .getByRole('button', { name: 'Format', exact: true })
      .click();
    await page
      .getByRole('toolbar', { name: 'Left JSON actions' })
      .getByRole('button', { name: 'Schema', exact: true })
      .click();
    await setCodeMirrorText(page.getByTestId('schema-editor-left'), '{"type":"object"}');
    await page.getByText('Validating').waitFor();
    await editor.getByRole('button', { name: /^tree$/i }).click();
    await page
      .getByRole('group', { name: 'Compare controls' })
      .getByRole('button', { name: 'Copy left to right', exact: true })
      .click();
    await editor.getByRole('button', { name: /^text$/i }).click();
    await setCodeMirrorText(editor, '{"items":[{"id":1},{"id":2}]}');
    await setCodeMirrorText(page.getByTestId('json-editor-right'), '{"items":[{"id":1},{"id":3}]}');
    const compare = page.getByRole('group', { name: 'Compare controls' });
    await compare.getByRole('checkbox', { name: 'Compare' }).check();
    await page.getByTestId('compare-summary').filter({ hasText: 'change' }).waitFor();
  },
};

export async function exerciseTool(page: Page, toolId: string): Promise<void> {
  await EXERCISES[toolId]?.(page);
}
