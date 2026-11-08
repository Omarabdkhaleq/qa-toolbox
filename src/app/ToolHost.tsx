import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from 'react';
import type { ToolDefinition } from '../tools/types';
import { ToolErrorBoundary } from './ToolErrorBoundary';

const lazyCache = new Map<string, LazyExoticComponent<ComponentType>>();

/** Drops a tool's cached lazy component so the next render re-runs its `load` (e.g. after a failed chunk fetch). */
export function clearToolCache(id: string): void {
  lazyCache.delete(id);
}

function lazyTool(tool: ToolDefinition): LazyExoticComponent<ComponentType> {
  let component = lazyCache.get(tool.id);
  if (!component) {
    component = lazy(tool.load);
    lazyCache.set(tool.id, component);
  }
  return component;
}

export function ToolHost({ tool }: { tool: ToolDefinition }) {
  const [, setAttempt] = useState(0);
  const Tool = lazyTool(tool);
  return (
    <section className="tool" aria-labelledby="tool-title">
      <h1 id="tool-title" className="tool__title">
        {tool.name}
      </h1>
      <div className="tool__body">
        <ToolErrorBoundary
          key={tool.id}
          toolName={tool.name}
          onReset={() => {
            clearToolCache(tool.id);
            setAttempt((n) => n + 1); // re-render so lazyTool() builds a fresh component
          }}
        >
          <Suspense fallback={<p role="status">Loading…</p>}>
            <Tool />
          </Suspense>
        </ToolErrorBoundary>
      </div>
    </section>
  );
}
