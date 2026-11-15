import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangeList } from './ChangeList';
import type { Change } from './structural';

describe('ChangeList', () => {
  it('lists changes with path and detail and reports clicks', async () => {
    const change: Change = { kind: 'changed', path: ['user', 'email'], before: 'a', after: 'b' };
    const onSelect = vi.fn();
    render(<ChangeList changes={[change]} onSelect={onSelect} />);
    const item = screen.getByRole('button', { name: /Changed \$\.user\.email "a" → "b"/ });
    await userEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith(change);
  });

  it('caps long lists', () => {
    const many: Change[] = Array.from({ length: 5 }, (_, i) => ({
      kind: 'added',
      path: [i],
      after: i,
    }));
    render(<ChangeList changes={many} limit={2} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Showing the first 2 of 5 changes.')).toBeInTheDocument();
  });
});
