/**
 * DerConfiguratorSidebar — sidebar nawigacji 10-sekcyjnego DER v2.
 *
 * Komponent prezentacyjny konsumujący kontrakt `derConfiguratorContract.ts`.
 * Wzorzec analogiczny do `StationWizardSidebar.tsx` (krok 11/17).
 */
import { clsx } from 'clsx';

import {
  DER_CONFIGURATOR_SECTIONS,
  type DerConfiguratorSectionId,
  type DerKind,
} from './derConfiguratorContract';

export interface DerConfiguratorSidebarProps {
  readonly activeSection: DerConfiguratorSectionId;
  readonly onSelectSection: (id: DerConfiguratorSectionId) => void;
  readonly completedSections?: ReadonlySet<DerConfiguratorSectionId>;
  readonly errorSections?: ReadonlySet<DerConfiguratorSectionId>;
  readonly derKind: DerKind;
  readonly density?: 'compact' | 'comfortable';
}

const DER_KIND_LABEL_PL: Record<DerKind, string> = {
  PV: '☀ PV — fotowoltaika',
  BESS: '▣ BESS — magazyn energii',
  FW: '⊛ FW — farma wiatrowa',
};

export function DerConfiguratorSidebar(props: DerConfiguratorSidebarProps): JSX.Element {
  const { activeSection, onSelectSection, completedSections, errorSections, derKind, density = 'compact' } = props;
  const isCompact = density === 'compact';
  return (
    <nav
      data-testid="der-configurator-sidebar"
      data-der-kind={derKind}
      data-density={density}
      aria-label="DER Configurator — nawigacja sekcji"
      className={clsx(
        'flex h-full shrink-0 flex-col overflow-y-auto border-r border-scada-border bg-scada-bg',
        isCompact ? 'w-[240px]' : 'w-[320px]',
      )}
    >
      <div className="border-b border-scada-border px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-scada-muted">
          DER Configurator v2
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-scada-text">
          {DER_KIND_LABEL_PL[derKind]}
        </div>
        <div className="mt-0.5 text-[10px] text-scada-muted">
          10 sekcji · 22-osiowa macierz gotowości
        </div>
      </div>

      <div className="flex-1 py-1">
        {DER_CONFIGURATOR_SECTIONS.map((section) => {
          const isActive = section.id === activeSection;
          const isCompleted = completedSections?.has(section.id) ?? false;
          const isError = errorSections?.has(section.id) ?? false;
          return (
            <button
              key={section.id}
              type="button"
              data-testid={`der-section-${section.id}`}
              data-section-active={isActive ? 'true' : 'false'}
              data-section-completed={isCompleted ? 'true' : 'false'}
              data-section-error={isError ? 'true' : 'false'}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Sekcja ${section.n}: ${section.label}`}
              onClick={() => onSelectSection(section.id)}
              className={clsx(
                'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                isActive
                  ? 'bg-sygnal-info-tlo/6 text-sygnal-info-tusz'
                  : 'text-scada-muted hover:bg-scada-bg hover:text-scada-text',
              )}
            >
              <span
                className={clsx(
                  'grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold',
                  isActive
                    ? 'bg-sygnal-info text-scada-bg'
                    : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : isError
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-scada-bg text-scada-muted',
                )}
              >
                {isCompleted ? '✓' : isError ? '!' : section.n}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">
                <span className="mr-1">{section.icon}</span>
                {section.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-scada-border px-3 py-2 text-[10px] text-scada-muted">
        Źródło: DER Engineering v2 (bundle KWranPTV)
      </div>
    </nav>
  );
}
