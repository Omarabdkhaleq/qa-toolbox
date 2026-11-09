export function MiddleMenu({
  onSwap,
  onCopy,
}: {
  onSwap: () => void;
  onCopy: (from: 'left' | 'right', to: 'left' | 'right') => void;
}) {
  return (
    <div className="json-menu" role="group" aria-label="Compare controls">
      <button type="button" onClick={onSwap}>
        Swap sides
      </button>
      <button type="button" onClick={() => onCopy('left', 'right')}>
        Copy left to right
      </button>
      <button type="button" onClick={() => onCopy('right', 'left')}>
        Copy right to left
      </button>
    </div>
  );
}
