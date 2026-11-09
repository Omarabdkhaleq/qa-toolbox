import { useEffect, useMemo, useState } from 'react';
import {
  CommandsProvider,
  useRegisterCommands,
  useShortcut,
} from '../core/commands/CommandsContext';
import type { Command, Shortcut } from '../core/commands/types';
import { CommandButton } from './CommandButton';
import { CommandPalette } from './CommandPalette';
import type { ToolDefinition } from '../tools/types';
import { parseRoute, toolHref, useHashLocation } from './router';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { resolveTheme, useThemePreference } from './theme';
import { ToolHost } from './ToolHost';

const PALETTE_SHORTCUT: Shortcut = { mod: true, key: 'k' };

export function App({ tools }: { tools: readonly ToolDefinition[] }) {
  return (
    <CommandsProvider>
      <Shell tools={tools} />
    </CommandsProvider>
  );
}

function Shell({ tools }: { tools: readonly ToolDefinition[] }) {
  const route = parseRoute(useHashLocation());
  const [theme, setTheme] = useThemePreference();
  const firstToolId = tools[0]?.id;
  const [paletteOpen, setPaletteOpen] = useState(false);

  const appCommands = useMemo<Command[]>(
    () => [
      // Listed with the keyboard reference; the shortcut itself is handled below.
      {
        id: 'app.palette',
        title: 'Open command palette',
        group: 'Keyboard reference',
        shortcut: PALETTE_SHORTCUT,
      },
      {
        id: 'app.toggle-theme',
        title: 'Toggle theme',
        group: 'App',
        run: () => {
          const dark = document.documentElement.dataset.theme === 'dark';
          setTheme(resolveTheme(theme, dark) === 'dark' ? 'light' : 'dark');
        },
      },
      ...tools.map<Command>((t) => ({
        id: `app.go.${t.id}`,
        title: `Go to ${t.name}`,
        group: 'Navigation',
        run: () => {
          window.location.hash = toolHref(t.id);
        },
      })),
    ],
    [tools, theme, setTheme],
  );
  useRegisterCommands(appCommands);
  useShortcut(PALETTE_SHORTCUT, () => setPaletteOpen(true));

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
      <CommandButton onClick={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
