import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';

describe('CodeEditor', () => {
  it('renders the value, labels the editable area, and follows external value changes', () => {
    const ref = createRef<CodeEditorHandle>();
    const { rerender } = render(
      <CodeEditor value={'{"a":1}'} ariaLabel="Left JSON" testId="ed" ref={ref} />,
    );
    const content = screen.getByTestId('ed').querySelector('.cm-content')!;
    expect(content).toHaveAttribute('aria-label', 'Left JSON');
    expect(content.textContent).toBe('{"a":1}');
    rerender(<CodeEditor value={'[1]'} ariaLabel="Left JSON" testId="ed" ref={ref} />);
    expect(content.textContent).toBe('[1]');
    expect(() => ref.current!.scrollToLine(50)).not.toThrow();
  });

  it('is read-only when asked', () => {
    render(<CodeEditor value="x" ariaLabel="Out" testId="ro" readOnly />);
    expect(screen.getByTestId('ro').querySelector('.cm-content')).toHaveAttribute(
      'contenteditable',
      'false',
    );
  });
});
