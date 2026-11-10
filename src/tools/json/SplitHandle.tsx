import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { splitFromKey, splitFromPointer } from './logic';

const KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'] as const;
type SplitKey = (typeof KEYS)[number];
const isSplitKey = (key: string): key is SplitKey => (KEYS as readonly string[]).includes(key);

const RESIZING_CLASS = 'is-resizing';

/**
 * A 16 px hit zone with a thinner visible grip bar. The left handle is the focusable
 * `separator`; the right one shares its pointer behaviour and double-click reset but is hidden
 * from assistive technology so the page keeps exactly one separator.
 */
export function SplitHandle({
  side,
  split,
  onSplit,
  onReset,
}: {
  side: 'left' | 'right';
  split: number;
  onSplit: (value: number) => void;
  onReset: () => void;
}) {
  const dragging = useRef(false);

  const stop = () => {
    dragging.current = false;
    document.body.classList.remove(RESIZING_CLASS);
  };
  useEffect(() => () => document.body.classList.remove(RESIZING_CLASS), []);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const container = event.currentTarget.closest('.json-tool');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    onSplit(splitFromPointer(event.clientX - rect.left, rect.width));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isSplitKey(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter') onReset();
    else onSplit(splitFromKey(split, event.key));
  };

  const pointer = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      dragging.current = true;
      document.body.classList.add(RESIZING_CLASS);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: move,
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onDoubleClick: onReset,
  };

  const grip = <span className="split-handle__grip" aria-hidden="true" />;

  if (side === 'right') {
    return (
      <div
        className="split-handle split-handle--right"
        data-testid="split-handle-right"
        aria-hidden="true"
        {...pointer}
      >
        {grip}
      </div>
    );
  }
  return (
    <div
      className="split-handle split-handle--left"
      role="separator"
      aria-label="Resize editors"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(split)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...pointer}
    >
      {grip}
    </div>
  );
}
