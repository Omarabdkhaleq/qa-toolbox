import type { ToolDefinition } from '../types';

export const jsonEditor: ToolDefinition = {
  id: 'json-editor',
  name: 'JSON Editor',
  category: 'data',
  description: 'View, edit, format, repair, query and validate JSON.',
  keywords: ['json', 'format', 'tree', 'repair', 'schema', 'query', 'jmespath', 'jsonpath'],
  load: () => import('./JsonEditorTool'),
};
