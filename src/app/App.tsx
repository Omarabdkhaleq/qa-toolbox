import { useEffect } from 'react';
import type { ToolDefinition } from '../tools/types';
import { parseRoute, toolHref, useHashLocation } from './router';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { useThemePreference } from './theme';
import { ToolHost } from './ToolHost';

export function App({ tools }: { tools: readonly ToolDefinition[] }) {
  const route = parseRoute(useHashLocation());
  const [theme, setTheme] = useThemePreference();
  const firstToolId = tools[0]?.id;

  useEffect(() => {
    if (route.kind === 'home' && firstToolId) window.location.replace(toolHref(firstToolId));
  }, [route.kind, firstToolId]);

  const tool = route.kind === 'tool' ? tools.find((t) => t.id === route.toolId) : undefined;

  return (
    <div className="app">
      <header className="app__header">
        <a className="app__brand" href={firstToolId ? toolHref(firstToolId) : '#/'}>
          qa-toolbox
        </a>
        <ThemeToggle value={theme} onChange={setTheme} />
      </header>
      <Sidebar tools={tools} activeId={tool?.id} />
      <main className="main">
        {tool && <ToolHost tool={tool} />}
        {route.kind !== 'home' && !tool && (
          <div className="not-found">
            <h1>Tool not found</h1>
            <p>
              <a href="#/">Go to the first tool</a>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
