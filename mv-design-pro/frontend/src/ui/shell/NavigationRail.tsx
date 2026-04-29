import { useCallback, useEffect } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore } from '../app-state/store';
import { AREA_DEFINITIONS, type AreaId } from '../navigation/areaRegistry';
import { TechnicalIcon } from '../icons/technicalIconRegistry';

function statusMarker(areaId: AreaId, activeArea: AreaId) {
  if (areaId === 'MODEL_SIECI') {
    return { label: 'Braki modelu', className: 'border-scada-grounded text-scada-grounded', glyph: '!' };
  }
  if (areaId === 'WYNIKI_ANALIZY') {
    return { label: 'Wyniki dostępne po obliczeniach', className: 'border-scada-energized text-scada-energized', glyph: 'W' };
  }
  if (areaId === 'HISTORIA_AUDYT' && activeArea === areaId) {
    return { label: 'Tryb audytowy', className: 'border-scada-sn text-scada-sn', glyph: 'A' };
  }
  return null;
}

export function NavigationRail() {
  const activeArea = useAppStateStore((s) => s.activeArea);
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const idx = Number.parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < AREA_DEFINITIONS.length) {
        e.preventDefault();
        setActiveArea(AREA_DEFINITIONS[idx].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveArea]);

  const handleAreaClick = useCallback(
    (areaId: AreaId) => setActiveArea(areaId),
    [setActiveArea],
  );

  return (
    <nav
      data-testid="navigation-rail"
      aria-label="Pasek obszarów roboczych"
      className="flex w-14 shrink-0 flex-col items-center border-r border-scada-border bg-scada-surface py-2"
    >
      <div className="flex flex-1 flex-col items-center gap-1 pt-1">
        {AREA_DEFINITIONS.map((area) => {
          const isActive = activeArea === area.id;
          const marker = statusMarker(area.id, activeArea);
          return (
            <button
              key={area.id}
              type="button"
              data-testid={area.testId}
              data-area-id={area.id}
              aria-label={`${area.labelFull}. ${area.description}. Skrót: ${area.shortcut}`}
              title={area.tooltip}
              onClick={() => handleAreaClick(area.id)}
              className={clsx(
                'relative grid h-[52px] w-[52px] grid-rows-[20px_1fr] place-items-center rounded-md px-1 py-1 transition-colors',
                isActive
                  ? 'bg-scada-active text-scada-sn'
                  : 'text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text',
              )}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r bg-scada-sn"
                  aria-hidden="true"
                />
              )}
              <TechnicalIcon
                name={area.icon}
                size={20}
                status={isActive ? 'active' : 'normal'}
              />
              <span className="max-w-full truncate text-[9px] font-semibold leading-tight tracking-normal">
                {area.labelShort}
              </span>
              {marker && (
                <span
                  className={clsx(
                    'absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-sm border bg-scada-surface px-0.5 text-[8px] font-bold leading-none',
                    marker.className,
                  )}
                  aria-label={marker.label}
                  title={marker.label}
                >
                  {marker.glyph}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
