import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CommandsProvider,
  useCommandsOs,
  useRegisterCommands,
  useShortcut,
} from '../core/commands/CommandsContext';
import type { Command, Shortcut } from '../core/commands/types';
import { CommandButton } from './CommandButton';
import { formatShortcut } from '../core/commands/shortcuts';
import { CommandPalette } from './CommandPalette';
import type { ToolDefinition } from '../tools/types';
import { parseRoute, toolHref, useHashLocation } from './router';
import { Sidebar, SIDEBAR_ID } from './Sidebar';
import { readSidebarOpen, useNarrowScreen, writeSidebarOpen } from './sidebarState';
import { ThemeToggle } from './ThemeToggle';
import { resolveTheme, useThemePreference } from './theme';
import { ToolHost } from './ToolHost';

const PALETTE_SHORTCUT: Shortcut = { mod: true, key: 'k' };
const SIDEBAR_SHORTCUT: Shortcut = { mod: true, key: 'b' };

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
  const os = useCommandsOs();
  const narrow = useNarrowScreen();
  const [wideOpen, setWideOpen] = useState(() => readSidebarOpen());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Narrow screens always start closed and ignore the stored desktop preference.
  const sidebarOpen = narrow ? drawerOpen : wideOpen;
  const toggleSidebar = () => {
    if (narrow) setDrawerOpen((open) => !open);
    else {
      writeSidebarOpen(!wideOpen);
      setWideOpen(!wideOpen);
    }
  };
  const closeDrawer = () => setDrawerOpen(false);

  // Closing the drawer (any way) hands focus back to the menu button.
  const wasDrawerOpen = useRef(false);
  const drawerShown = narrow && drawerOpen;
  useEffect(() => {
    if (wasDrawerOpen.current && !drawerShown) menuButtonRef.current?.focus();
    wasDrawerOpen.current = drawerShown;
  }, [drawerShown]);
  useEffect(() => {
    if (!drawerShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerShown]);

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
        id: 'app.toggle-sidebar',
        title: 'Toggle tools menu',
        group: 'App',
        shortcut: SIDEBAR_SHORTCUT,
        run: toggleSidebar,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tools, theme, setTheme, narrow, wideOpen],
  );
  useRegisterCommands(appCommands);
  useShortcut(PALETTE_SHORTCUT, () => setPaletteOpen(true));

  useEffect(() => {
    if (route.kind === 'home' && firstToolId) window.location.replace(toolHref(firstToolId));
  }, [route.kind, firstToolId]);

  const tool = route.kind === 'tool' ? tools.find((t) => t.id === route.toolId) : undefined;

  return (
    <div className={`app${sidebarOpen ? '' : ' app--nav-closed'}`}>
      <header className="app__header">
        <div className="app__header-start">
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-button"
            aria-label="Tools menu"
            title={`Toggle tools menu (${formatShortcut(SIDEBAR_SHORTCUT, os)})`}
            aria-expanded={sidebarOpen}
            aria-controls={SIDEBAR_ID}
            onClick={toggleSidebar}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <a className="app__brand" href={firstToolId ? toolHref(firstToolId) : '#/'}>
            qa-toolbox
          </a>
        </div>
        <ThemeToggle value={theme} onChange={setTheme} />
      </header>
      <Sidebar
        tools={tools}
        activeId={tool?.id}
        modal={narrow}
        open={sidebarOpen}
        onClose={closeDrawer}
      />
      {drawerShown && (
        <div className="sidebar-backdrop" data-testid="sidebar-backdrop" onClick={closeDrawer} />
      )}
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
