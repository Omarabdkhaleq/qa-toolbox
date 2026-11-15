import { useEffect, useRef, type KeyboardEvent } from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER, type ToolDefinition } from '../tools/types';
import { toolHref } from './router';

export const SIDEBAR_ID = 'sidebar-nav';

const FOCUSABLE = 'a[href], button:not(:disabled)';

export function Sidebar({
  tools,
  activeId,
  modal,
  open,
  onClose,
}: {
  tools: readonly ToolDefinition[];
  activeId?: string;
  /** Narrow screens: the sidebar is an overlay drawer that traps focus while open. */
  modal: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const isModalOpen = modal && open;

  // Move focus into the drawer when it opens as a modal.
  useEffect(() => {
    if (isModalOpen) ref.current?.querySelector<HTMLElement>('a[href]')?.focus();
  }, [isModalOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isModalOpen || event.key !== 'Tab') return;
    const items = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!items?.length) return;
    // Move focus ourselves: WebKit's native Tab order skips links, so relying on it would let
    // focus leave the modal drawer.
    event.preventDefault();
    const list = Array.from(items);
    const at = list.indexOf(document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    list[(at + step + list.length) % list.length]!.focus();
  };

  return (
    <nav
      ref={ref}
      id={SIDEBAR_ID}
      className="sidebar"
      aria-label="Tools"
      role={isModalOpen ? 'dialog' : undefined}
      aria-modal={isModalOpen ? true : undefined}
      onKeyDown={onKeyDown}
    >
      <button type="button" className="sidebar__close" onClick={onClose}>
        <span aria-hidden="true">✕</span>
        <span className="visually-hidden">Close tools menu</span>
      </button>
      {CATEGORY_ORDER.map((category) => {
        const inCategory = tools.filter((t) => t.category === category);
        if (inCategory.length === 0) return null;
        return (
          <div key={category} className="sidebar__group">
            <h2 className="sidebar__heading">{CATEGORY_LABELS[category]}</h2>
            <ul className="sidebar__list">
              {inCategory.map((t) => (
                <li key={t.id}>
                  <a
                    className="sidebar__link"
                    href={toolHref(t.id)}
                    title={t.description}
                    aria-current={t.id === activeId ? 'page' : undefined}
                    onClick={modal ? onClose : undefined}
                  >
                    {t.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
