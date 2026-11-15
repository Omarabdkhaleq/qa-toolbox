import { json } from './json';
import type { ToolDefinition } from './types';

/** The only file to touch when adding a tool. */
export const tools: readonly ToolDefinition[] = [json];
