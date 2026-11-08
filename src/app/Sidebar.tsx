import { CATEGORY_LABELS, CATEGORY_ORDER, type ToolDefinition } from '../tools/types';
import { toolHref } from './router';

export function Sidebar({
  tools,
  activeId,
}: {
  tools: readonly ToolDefinition[];
  activeId?: string;
}) {
  return (
    <nav className="sidebar" aria-label="Tools">
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
