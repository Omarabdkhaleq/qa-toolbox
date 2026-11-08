import type { ReactNode } from 'react';

export function Banner({
  kind,
  children,
  onDismiss,
}: {
  kind: 'error' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`banner banner--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
