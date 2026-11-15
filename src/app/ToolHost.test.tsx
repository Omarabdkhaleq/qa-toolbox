import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../tools/types';
import { ToolHost } from './ToolHost';

describe('ToolHost', () => {
  afterEach(() => vi.restoreAllMocks());

  it('recovers via "Reload tool" after the tool chunk failed to load once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValue({ default: () => <p>loaded tool</p> });
    const tool = { id: 'flaky-tool', name: 'Flaky', load } as unknown as ToolDefinition;
    render(<ToolHost tool={tool} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This tool crashed');
    await userEvent.click(screen.getByRole('button', { name: 'Reload tool' }));
    expect(await screen.findByText('loaded tool')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
