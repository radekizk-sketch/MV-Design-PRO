/**
 * InspectorBreadcrumb — dwukierunkowy breadcrumb (PR-7).
 *
 * Brief 2 §5 pkt 2: Projekt > GPZ > Ciąg główny > Stacja ST-01 > Rozdzielnia SN >
 * Pole transformatorowe. Klik wraca do nadrzędnego obiektu.
 */

export interface BreadcrumbItem {
  readonly id: string;
  readonly labelPl: string;
  readonly onClick?: () => void;  // jeśli undefined, item nie jest klikalny
}

export interface InspectorBreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
}

export function InspectorBreadcrumb(props: InspectorBreadcrumbProps): JSX.Element | null {
  const { items } = props;
  if (items.length === 0) return null;

  return (
    <nav
      data-testid="inspector-breadcrumb"
      aria-label="Ścieżka nawigacji"
      className="shrink-0 border-b border-scada-border bg-scada-bg px-3 py-1.5"
    >
      <ol className="flex flex-wrap items-center gap-1 text-xs text-scada-muted">
        {items.map((item, idx) => (
          <li key={item.id} className="flex items-center gap-1">
            {idx > 0 && <span aria-hidden="true">›</span>}
            {item.onClick && idx < items.length - 1 ? (
              <button
                type="button"
                data-testid={`breadcrumb-${item.id}`}
                onClick={item.onClick}
                className="rounded px-1 hover:bg-scada-panel-raised hover:text-scada-text"
              >
                {item.labelPl}
              </button>
            ) : (
              <span
                data-testid={`breadcrumb-${item.id}`}
                className={idx === items.length - 1 ? 'font-medium text-scada-text' : ''}
              >
                {item.labelPl}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
