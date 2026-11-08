import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
