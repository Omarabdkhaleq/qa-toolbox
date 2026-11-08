import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolErrorBoundary } from './ToolErrorBoundary';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('kaboom');
  return <p>all good</p>;
}

function Harness() {
  const [explode, setExplode] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setExplode(false)}>
        defuse
      </button>
      <ToolErrorBoundary toolName="Bomb">
        <Bomb explode={explode} />
      </ToolErrorBoundary>
    </>
  );
}

describe('ToolErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a fallback with details and recovers on reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('This tool crashed');
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'defuse' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reload tool' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
  });
});
