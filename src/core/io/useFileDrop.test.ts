import { act, renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFileDrop } from './useFileDrop';

const dragEvent = (types: string[], files: File[] = []) =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { types, files },
  }) as unknown as DragEvent;

describe('useFileDrop', () => {
  it('highlights while dragging files and delivers the first dropped file', () => {
    const onFile = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFile));
    const over = dragEvent(['Files']);
    act(() => result.current.dropProps.onDragOverCapture(over));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(result.current.isOver).toBe(true);

    const file = new File(['{}'], 'a.json');
    const drop = dragEvent(['Files'], [file]);
    act(() => result.current.dropProps.onDropCapture(drop));
    expect(drop.stopPropagation).toHaveBeenCalled();
    expect(onFile).toHaveBeenCalledWith(file);
    expect(result.current.isOver).toBe(false);
  });

  it('ignores drags that carry no files', () => {
    const onFile = vi.fn();
    const { result } = renderHook(() => useFileDrop(onFile));
    const textDrag = dragEvent(['text/plain']);
    act(() => result.current.dropProps.onDragOverCapture(textDrag));
    expect(textDrag.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.dropProps.onDropCapture(textDrag));
    expect(onFile).not.toHaveBeenCalled();
    act(() => result.current.dropProps.onDragLeave());
    expect(result.current.isOver).toBe(false);
  });
});
