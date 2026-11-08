import type { Page } from '@playwright/test';

type Exercise = (page: Page) => Promise<void>;

/** Per-tool "use it for real" steps, used by the no-egress and CSP checks. */
const EXERCISES: Record<string, Exercise> = {};

export async function exerciseTool(page: Page, toolId: string): Promise<void> {
  await EXERCISES[toolId]?.(page);
}
