import type { ToolDefinition } from '../types';

export const json: ToolDefinition = {
  id: 'json',
  name: 'JSON',
  category: 'data',
  description: 'View, edit, format, repair, query, validate and compare JSON.',
  keywords: [
    'json',
    'format',
    'tree',
    'repair',
    'schema',
    'query',
    'jmespath',
    'jsonpath',
    'compare',
    'diff',
  ],
  load: () => import('./JsonTool'),
};
