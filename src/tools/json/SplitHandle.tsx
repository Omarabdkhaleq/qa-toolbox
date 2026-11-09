import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { splitFromKey, splitFromPointer } from './logic';

const KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'] as const;
type SplitKey = (typeof KEYS)[number];
const isSplitKey = (key: string): key is SplitKey => (KEYS as readonly string[]).includes(key);

export function SplitHandle({
  split,
  onSplit,
  onReset,
}: {
  split: number;
  onSplit: (value: number) => void;
  onReset: () => void;
}) {
  const dragging = useRef(false);

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

  return (
    <div
      className="split-handle"
      role="separator"
      aria-label="Resize editors"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(split)}
      tabIndex={0}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
