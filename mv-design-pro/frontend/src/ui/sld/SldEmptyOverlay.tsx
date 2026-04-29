import { clsx } from 'clsx';

import { useHasActiveCase } from '../app-state';

export type SldEmptyState =
  | 'NO_PROJECT'
  | 'NO_CASE'
  | 'NO_SNAPSHOT'
  | 'NO_MODEL'
  | 'LOADING';

const EmptyStateIcons: Record<SldEmptyState, React.ReactNode> = {
  NO_PROJECT: (
    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  ),
  NO_CASE: (
    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  NO_SNAPSHOT: (
    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  NO_MODEL: (
    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  LOADING: (
    <svg className="h-10 w-10 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
};

const EMPTY_STATE_CONFIG: Record<
  SldEmptyState,
  {
    title: string;
    description: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
    iconColor: string;
    accentColor: string;
  }
> = {
  NO_PROJECT: {
    title: 'Brak aktywnego projektu',
    description: 'Utworz lub otworz projekt, aby rozpoczac modelowanie sieci.',
    bgColor: 'bg-scada-panel/95',
    borderColor: 'border-amber-500/40',
    textColor: 'text-amber-100',
    iconColor: 'text-amber-300',
    accentColor: 'bg-amber-600',
  },
  NO_CASE: {
    title: 'Brak aktywnego wariantu pracy',
    description: 'Aktywuj istniejacy wariant pracy albo skonfiguruj pierwszy wariant, aby prowadzic model i obliczenia.',
    bgColor: 'bg-scada-panel/95',
    borderColor: 'border-scada-border',
    textColor: 'text-scada-text',
    iconColor: 'text-scada-sn',
    accentColor: 'bg-blue-600',
  },
  NO_SNAPSHOT: {
    title: 'Brak aktywnego stanu modelu',
    description: 'Wybierz stan modelu w drzewie projektu lub przygotuj nowy.',
    bgColor: 'bg-scada-panel/95',
    borderColor: 'border-violet-500/35',
    textColor: 'text-violet-100',
    iconColor: 'text-violet-300',
    accentColor: 'bg-violet-600',
  },
  NO_MODEL: {
    title: 'Brak źródła zasilania',
    description: 'Aby rozpocząć modelowanie sieci, utwórz Główny Punkt Zasilający.',
    bgColor: 'bg-slate-950/92',
    borderColor: 'border-sky-500/45',
    textColor: 'text-slate-100',
    iconColor: 'text-sky-300',
    accentColor: 'bg-sky-600',
  },
  LOADING: {
    title: 'Ladowanie schematu...',
    description: 'Trwa ladowanie danych modelu sieci.',
    bgColor: 'bg-scada-panel/95',
    borderColor: 'border-scada-border',
    textColor: 'text-scada-muted',
    iconColor: 'text-scada-muted',
    accentColor: 'bg-slate-600',
  },
};

export interface SldEmptyOverlayProps {
  state?: SldEmptyState;
  forceShow?: boolean;
  hasSource?: boolean;
  hasCases?: boolean;
  onSelectCase?: () => void;
  onCreateCase?: () => void;
  onCreateSimpleGpz?: () => void;
  onCreateFullGpz?: () => void;
  isCreatingCase?: boolean;
  isCreatingGpz?: boolean;
  createCaseDisabled?: boolean;
  createCaseDisabledReason?: string;
  createGpzDisabled?: boolean;
  createGpzDisabledReason?: string;
  className?: string;
}

export function SldEmptyOverlay({
  state,
  forceShow = false,
  hasSource = false,
  hasCases = false,
  onSelectCase,
  onCreateCase,
  onCreateSimpleGpz,
  onCreateFullGpz,
  isCreatingCase = false,
  isCreatingGpz = false,
  createCaseDisabled = false,
  createCaseDisabledReason,
  createGpzDisabled = false,
  createGpzDisabledReason,
  className,
}: SldEmptyOverlayProps) {
  const hasActiveCase = useHasActiveCase();

  const resolvedState: SldEmptyState | null = state ?? (!hasActiveCase ? 'NO_CASE' : null);
  if (!resolvedState && !forceShow) {
    return null;
  }

  const config = resolvedState ? EMPTY_STATE_CONFIG[resolvedState] : null;
  if (!config) {
    return null;
  }

  const showCaseActions = resolvedState === 'NO_CASE' && (onSelectCase || onCreateCase);
  const showGpzActions =
    resolvedState === 'NO_MODEL' && !hasSource && (onCreateSimpleGpz || onCreateFullGpz);
  const gpzDisabled = createGpzDisabled || isCreatingGpz;

  return (
    <div
      className={clsx('absolute left-0 right-0 top-0 z-10 p-4 pointer-events-none', className)}
      data-testid="sld-empty-overlay"
      data-state={resolvedState}
    >
      <div
        className={clsx(
          'pointer-events-auto flex items-center gap-4 rounded-lg border px-5 py-4 shadow-md backdrop-blur-sm',
          config.bgColor,
          config.borderColor,
        )}
      >
        <div className={clsx('flex-shrink-0 rounded-lg border border-scada-border bg-scada-bg/70 p-2', config.iconColor)}>
          {EmptyStateIcons[resolvedState as SldEmptyState]}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <h3 className={clsx('text-sm font-semibold', config.textColor)} data-testid="sld-empty-overlay-title">
              {config.title}
            </h3>
          </div>
          <p className={clsx('text-sm leading-snug opacity-75', config.textColor)}>{config.description}</p>
        </div>

        {showCaseActions && (
          <div className="flex flex-shrink-0 items-center gap-2">
            {hasCases && onSelectCase && (
              <button
                type="button"
                onClick={onSelectCase}
                className={clsx(
                  'rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:opacity-90 hover:shadow',
                  config.accentColor,
                )}
                data-testid="sld-empty-overlay-select-case"
              >
                Wybierz wariant pracy
              </button>
            )}
            {!hasCases && onCreateCase && (
              <button
                type="button"
                onClick={onCreateCase}
                disabled={createCaseDisabled || isCreatingCase}
                title={createCaseDisabled ? createCaseDisabledReason : undefined}
                className={clsx(
                  'rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150',
                  config.accentColor,
                  !(createCaseDisabled || isCreatingCase) && 'hover:opacity-90 hover:shadow',
                  (createCaseDisabled || isCreatingCase) && 'cursor-not-allowed opacity-60',
                )}
                data-testid="sld-empty-overlay-create-case"
              >
                {isCreatingCase ? 'Przygotowywanie wariantu...' : 'Skonfiguruj pierwszy wariant'}
              </button>
            )}
            {hasCases && onCreateCase && (
              <button
                type="button"
                onClick={onCreateCase}
                className="rounded-md border border-scada-border bg-scada-bg/80 px-4 py-2 text-sm font-medium text-scada-text transition-all duration-150 hover:bg-scada-active hover:text-scada-sn"
                data-testid="sld-empty-overlay-create-new"
              >
                Nowy wariant pracy
              </button>
            )}
          </div>
        )}

        {showGpzActions && (
          <div className="flex flex-shrink-0 items-center gap-2">
            {onCreateSimpleGpz && (
              <button
                type="button"
                onClick={onCreateSimpleGpz}
                disabled={gpzDisabled}
                title={createGpzDisabled ? createGpzDisabledReason : undefined}
                className={clsx(
                  'rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150',
                  config.accentColor,
                  !gpzDisabled && 'hover:opacity-90 hover:shadow',
                  gpzDisabled && 'cursor-not-allowed opacity-60',
                )}
                data-testid="sld-empty-overlay-create-gpz-simple"
              >
                {isCreatingGpz ? 'Tworzenie GPZ...' : 'Utwórz GPZ uproszczony'}
              </button>
            )}
            {onCreateFullGpz && (
              <button
                type="button"
                onClick={onCreateFullGpz}
                disabled={gpzDisabled}
                title={createGpzDisabled ? createGpzDisabledReason : undefined}
                className={clsx(
                  'rounded-md border border-sky-400/70 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-sky-100 transition-all duration-150',
                  !gpzDisabled && 'hover:border-sky-300 hover:bg-slate-800',
                  gpzDisabled && 'cursor-not-allowed opacity-60',
                )}
                data-testid="sld-empty-overlay-create-gpz-full"
              >
                Utwórz GPZ pełny
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SldEmptyOverlay;
