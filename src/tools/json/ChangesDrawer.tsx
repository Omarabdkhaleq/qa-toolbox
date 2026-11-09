import { useEffect, useLayoutEffect, useRef } from 'react';
import { ChangeList } from '../../core/diff/ChangeList';
import type { Change } from '../../core/diff/structural';

export function ChangesDrawer({
  changes,
  onSelect,
  onClose,
  onFocusLost,
}: {
  changes: readonly Change[];
  onSelect: (index: number) => void;
  onClose: () => void;
  /** The drawer is closing while keyboard focus is inside it. */
  onFocusLost?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onFocusLostRef = useRef(onFocusLost);
  useEffect(() => {
    onFocusLostRef.current = onFocusLost;
  });

  // Layout cleanup runs while the drawer is still in the document, so focus can be checked.
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (el?.contains(document.activeElement)) onFocusLostRef.current?.();
    };
  }, []);

  // Opening moves focus into the drawer.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Safari does not focus a button on click, so after picking a change focus can fall to
  // <body>; Escape must still close the drawer then.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.target !== document.body) return;
      onFocusLostRef.current?.();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
