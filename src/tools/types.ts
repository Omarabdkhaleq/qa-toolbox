import type { ComponentType } from 'react';

export type ToolCategory = 'data' | 'text' | 'encode' | 'qa';

export const CATEGORY_ORDER: readonly ToolCategory[] = ['data', 'text', 'encode', 'qa'];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  data: 'Data',
  text: 'Text',
  encode: 'Encode',
  qa: 'QA',
};

export interface ToolDefinition {
  /** kebab-case; route = /#/tools/<id> */
  id: string;
  name: string;
  category: ToolCategory;
  /** Non-empty; shown as the sidebar tooltip. */
  description: string;
  /** For future search / command palette. */
  keywords: string[];
  /** Lazy chunk. Keep index.ts free of other imports so the chunk stays lazy. */
  load: () => Promise<{ default: ComponentType }>;
}
