import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('renders React into jsdom with jest-dom matchers', () => {
    render(<button type="button">Ping</button>);
    expect(screen.getByRole('button', { name: 'Ping' })).toBeInTheDocument();
  });
});
