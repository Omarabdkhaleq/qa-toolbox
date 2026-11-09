import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectOs, formatShortcut } from '../core/commands/shortcuts';
import type { ToolDefinition } from '../tools/types';
import { App } from './App';

const fakeTools: ToolDefinition[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    category: 'data',
    description: 'First tool',
    keywords: [],
    load: async () => ({ default: () => <p>alpha body</p> }),
  },
  {
    id: 'crashy',
    name: 'Crashy',
    category: 'text',
    description: 'Always throws',
    keywords: [],
    load: async () => ({
      default: () => {
        throw new Error('boom');
      },
    }),
  },
];

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  afterEach(() => vi.restoreAllMocks());

  it('groups tools by category in the sidebar', () => {
    window.location.hash = '#/tools/alpha';
    render(<App tools={fakeTools} />);
    const nav = screen.getByRole('navigation', { name: 'Tools' });
    expect(nav).toHaveTextContent('Data');
    expect(nav).toHaveTextContent('Text');
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '#/tools/alpha');
  });

  it('renders the active tool with its title and marks the link current', async () => {
    window.location.hash = '#/tools/alpha';
    render(<App tools={fakeTools} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Alpha' })).toBeInTheDocument();
    expect(await screen.findByText('alpha body')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('aria-current', 'page');
  });

  it('redirects home to the first tool', async () => {
    render(<App tools={fakeTools} />);
    expect(await screen.findByText('alpha body')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/tools/alpha');
  });

  it('shows not found for unknown tools', () => {
    window.location.hash = '#/tools/missing';
    render(<App tools={fakeTools} />);
    expect(screen.getByRole('heading', { name: 'Tool not found' })).toBeInTheDocument();
  });

  it('contains a crashing tool without breaking the shell', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.location.hash = '#/tools/crashy';
    render(<App tools={fakeTools} />);
    expect(await screen.findByText('This tool crashed')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Tools' })).toBeInTheDocument();
  });
});

describe('App command palette', () => {
  beforeEach(() => {
    window.location.hash = '#/tools/alpha';
  });
  const os = detectOs();
  const modK = formatShortcut({ mod: true, key: 'k' }, os);

  it('the floating button has a tooltip with the OS shortcut', () => {
    render(<App tools={fakeTools} />);
    expect(screen.getByRole('button', { name: 'Commands and shortcuts' })).toHaveAttribute(
      'title',
      `Commands and shortcuts (${modK})`,
    );
  });

  it('opens on a real command; Open command palette is a read-only keyboard-reference row', async () => {
    const user = userEvent.setup();
    render(<App tools={fakeTools} />);
    await user.click(screen.getByRole('button', { name: 'Commands and shortcuts' }));
    const palette = screen.getByRole('dialog', { name: 'Command palette' });
    const options = within(palette).getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).not.toHaveAttribute('aria-disabled');
    const paletteRow = options.find((o) => o.textContent?.includes('Open command palette'))!;
    expect(paletteRow).toHaveAttribute('aria-disabled', 'true');
    expect(paletteRow).toHaveTextContent('Keyboard reference');
    expect(paletteRow).toHaveTextContent(modK);
    expect(options.indexOf(paletteRow)).toBeGreaterThan(
      options.findIndex((o) => !o.hasAttribute('aria-disabled')),
    );
  });

  it('still opens with its keyboard shortcut', () => {
    render(<App tools={fakeTools} />);
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: os === 'mac',
      ctrlKey: os !== 'mac',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(event.defaultPrevented).toBe(true);
  });
});
