import { useEffect, useRef } from 'react';
import { ChangeList } from '../../core/diff/ChangeList';
import type { Change } from '../../core/diff/structural';

export function ChangesDrawer({
  changes,
  onSelect,
  onClose,
}: {
  changes: readonly Change[];
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Opening moves focus into the drawer.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Publish the drawer's height for the floating palette button; removed on close/unmount.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--drawer-height', `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--drawer-height');
    };
  }, []);

  return (
    <section
      ref={ref}
      className="changes-drawer"
      role="region"
      aria-label="Changes"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="changes-drawer__header">
        <strong>Changes ({changes.length})</strong>
        <button ref={closeRef} type="button" aria-label="Close changes" onClick={onClose}>
          ✕
        </button>
      </div>
      <ChangeList changes={changes} onSelect={(change) => onSelect(changes.indexOf(change))} />
    </section>
  );
}
