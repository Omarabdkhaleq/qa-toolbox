import type { ToolDefinition } from '../types';

export const jsonCompare: ToolDefinition = {
  id: 'json-compare',
  name: 'JSON Compare',
  category: 'data',
  description: 'Compare two JSON documents as text or as structured changes.',
  keywords: ['json', 'diff', 'compare', 'changes', 'api response'],
  load: () => import('./JsonCompareTool'),
};
