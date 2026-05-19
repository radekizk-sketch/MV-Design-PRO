/**
 * ReadinessSection — zakres obliczeń 9 typów + raporty (PR-13).
 *
 * Brief 2 §4 sekcja 4 + §16. Każdy element ma status:
 * gotowe / częściowe / zablokowane / brak modułu obliczeniowego / nie dotyczy.
 */

export type ReadinessStatus = 'gotowe' | 'czesciowe' | 'zablokowane' | 'brak-modulu' | 'nie-dotyczy';

export interface ReadinessItem {
  readonly id: string;
  readonly labelPl: string;
  readonly status: ReadinessStatus;
  readonly missingFieldsPl?: readonly string[];
  readonly blockingObjectsCount?: number;
  readonly onShowOnSld?: () => void;
  readonly onFillData?: () => void;
}

export interface ReadinessSectionProps {
  readonly items: readonly ReadinessItem[];
}

const STATUS_LABEL: Record<ReadinessStatus, string> = {
  gotowe: 'gotowe',
  czesciowe: 'częściowe',
  zablokowane: 'do konfiguracji',
  'brak-modulu': 'brak modułu obliczeniowego',
  'nie-dotyczy': 'nie dotyczy',
};

const STATUS_CLASS: Record<ReadinessStatus, string> = {
  gotowe: 'text-status-ok',
  czesciowe: 'text-status-warn',
  zablokowane: 'text-status-error',
  'brak-modulu': 'text-scada-muted',
  'nie-dotyczy': 'text-scada-muted',
};

export const DEFAULT_READINESS_ITEMS: readonly Omit<ReadinessItem, 'status'>[] = [
  { id: 'power-flow', labelPl: 'Rozpływ mocy' },
  { id: 'voltage-profile', labelPl: 'Spadki/wzrosty napięcia' },
  { id: 'short-circuit', labelPl: 'Zwarcia' },
  { id: 'asymmetry', labelPl: 'Asymetria' },
  { id: 'loadability', labelPl: 'Obciążalność' },
  { id: 'stability', labelPl: 'Stabilność' },
  { id: 'frt-hvrt', labelPl: 'FRT / LVRT / HVRT' },
  { id: 'ncrfg', labelPl: 'Zgodność przyłączeniowa' },
  { id: 'report-osd', labelPl: 'Raport OSD' },
  { id: 'report-technical', labelPl: 'Raport techniczny' },
];

export function ReadinessSection(props: ReadinessSectionProps): JSX.Element {
  const { items } = props;

  return (
    <div data-testid="readiness-section" className="flex flex-col py-1">
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Zakres obliczeń
      </div>
      <div className="flex flex-col gap-1 px-2 py-1">
        {items.map((item) => (
          <div
            key={item.id}
            data-testid={`readiness-item-${item.id}`}
            data-status={item.status}
            className="rounded border border-scada-border bg-scada-panel-raised px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-scada-text">{item.labelPl}</span>
              <span className={`text-[10px] ${STATUS_CLASS[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>
            {item.missingFieldsPl && item.missingFieldsPl.length > 0 && (
              <div className="mt-1 text-[10px] text-scada-muted">
                Parametry do konfiguracji: {item.missingFieldsPl.join(', ')}
              </div>
            )}
            {item.blockingObjectsCount !== undefined && item.blockingObjectsCount > 0 && (
              <div className="mt-1 text-[10px] text-scada-muted">
                Obiekty do konfiguracji: {item.blockingObjectsCount}
              </div>
            )}
            {(item.onShowOnSld || item.onFillData) && (
              <div className="mt-1 flex gap-1">
                {item.onShowOnSld && (
                  <button
                    type="button"
                    data-testid={`readiness-show-sld-${item.id}`}
                    onClick={item.onShowOnSld}
                    className="rounded border border-scada-border px-1.5 py-0.5 text-[10px] text-scada-text hover:bg-scada-active"
                  >
                    Pokaż na SLD
                  </button>
                )}
                {item.onFillData && (
                  <button
                    type="button"
                    data-testid={`readiness-fill-${item.id}`}
                    onClick={item.onFillData}
                    className="rounded border border-scada-border px-1.5 py-0.5 text-[10px] text-scada-text hover:bg-scada-active"
                  >
                    Skonfiguruj
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
