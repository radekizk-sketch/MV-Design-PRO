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
    bgColor: 'bg-amber-50/90',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-900',
    iconColor: 'text-amber-600',
    accentColor: 'bg-amber-600',
  },
  NO_CASE: {
    title: 'Brak aktywnego wariantu pracy',
    description: 'Aktywuj istniejacy wariant pracy albo skonfiguruj pierwszy wariant, aby prowadzic model i obliczenia.',
    bgColor: 'bg-slate-50/95',
    borderColor: 'border-slate-300',
    textColor: 'text-slate-800',
    iconColor: 'text-slate-500',
    accentColor: 'bg-blue-600',
  },
  NO_SNAPSHOT: {
    title: 'Brak aktywnego stanu modelu',
    description: 'Wybierz stan modelu w drzewie projektu lub przygotuj nowy.',
    bgColor: 'bg-violet-50/90',
    borderColor: 'border-violet-300',
    textColor: 'text-violet-900',
    iconColor: 'text-violet-500',
    accentColor: 'bg-violet-600',
  },
  NO_MODEL: {
    title: 'Pusty schemat jednokreskowy',
    description: 'Kliknij prawym przyciskiem na schemacie i wybierz Siec -> Dodaj GPZ, aby rozpoczac projektowanie sieci.',
    bgColor: 'bg-stone-50/95',
    borderColor: 'border-stone-300',
    textColor: 'text-stone-700',
    iconColor: 'text-stone-400',
    accentColor: 'bg-stone-500',
  },
  LOADING: {
    title: 'Ladowanie schematu...',
    description: 'Trwa ladowanie danych modelu sieci.',
    bgColor: 'bg-slate-50/95',
    borderColor: 'border-slate-200',
    textColor: 'text-slate-600',
    iconColor: 'text-slate-400',
    accentColor: 'bg-slate-400',
  },
};

export interface SldEmptyOverlayProps {
  state?: SldEmptyState;
  forceShow?: boolean;
  hasSource?: boolean;
  hasCases?: boolean;
  onSelectCase?: () => void;
  onCreateCase?: () => void;
  isCreatingCase?: boolean;
  createCaseDisabled?: boolean;
  createCaseDisabledReason?: string;
  className?: string;
}

export function SldEmptyOverlay({
  state,
  forceShow = false,
  hasCases = false,
  onSelectCase,
  onCreateCase,
  isCreatingCase = false,
  createCaseDisabled = false,
  createCaseDisabledReason,
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
        <div className={clsx('flex-shrink-0 rounded-lg bg-white/50 p-2', config.iconColor)}>
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
                className="rounded-md border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-150 hover:border-slate-400 hover:bg-white"
                data-testid="sld-empty-overlay-create-new"
              >
                Nowy wariant pracy
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SldEmptyOverlay;
