import type { Locator } from '@playwright/test';

/** Replaces the whole document of the first CodeMirror editor inside `scope`. */
export async function setCodeMirrorText(scope: Locator, text: string): Promise<void> {
  const content = scope.locator('.cm-content').first();
  await content.click();
  await content.press('ControlOrMeta+a');
  if (text === '') await content.press('Delete');
  else await scope.page().keyboard.insertText(text);
}

/** Reads a small document (CodeMirror only renders visible lines). */
export async function readCodeMirrorText(scope: Locator): Promise<string> {
  return (await scope.locator('.cm-content').first().locator('.cm-line').allInnerTexts()).join(
    '\n',
  );
}
