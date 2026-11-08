import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { ToolDefinition } from '../tools/types';
import { ToolErrorBoundary } from './ToolErrorBoundary';

const lazyCache = new Map<string, LazyExoticComponent<ComponentType>>();

function lazyTool(tool: ToolDefinition): LazyExoticComponent<ComponentType> {
  let component = lazyCache.get(tool.id);
  if (!component) {
    component = lazy(tool.load);
    lazyCache.set(tool.id, component);
  }
  return component;
}

export function ToolHost({ tool }: { tool: ToolDefinition }) {
  const Tool = lazyTool(tool);
  return (
    <section className="tool" aria-labelledby="tool-title">
      <h1 id="tool-title" className="tool__title">
        {tool.name}
      </h1>
      <div className="tool__body">
        <ToolErrorBoundary key={tool.id} toolName={tool.name}>
          <Suspense fallback={<p role="status">Loading…</p>}>
            <Tool />
          </Suspense>
        </ToolErrorBoundary>
      </div>
    </section>
  );
}
