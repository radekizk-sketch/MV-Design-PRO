/**
 * EngineerWorkspaceDock — lewy panel prowadzenia pracy inżyniera SN
 *
 * Panel operatorski dla inżyniera projektującego sieć SN.
 * Zastępuje developerską paletę narzędzi.
 *
 * Sekcje:
 * 1. Kontekst pracy — projekt, napięcie, status modelu
 * 2. Następny krok — prowadzenie przez workflow
 * 3. Blokady i naprawy — lista aktywnych blokerów
 * 4. Działania dostępne — przyciski operatorskie
 * 5. Stan modelu — metryki i kompletność
 */

import { type ReactNode, useState, useCallback } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore, useActiveMode, useResultStatusLabel } from '../app-state';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useNetworkStats } from '../topology/useNetworkStats';
import { navigateToVariants, navigateToCaseConfig } from '../navigation/routes';
import { useNetworkBuildStore } from '../network-build/networkBuildStore';

// =============================================================================
// Icons
// =============================================================================

function IconBolt({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconNetwork({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconWarning({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-3.5 w-3.5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-3 w-3', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// =============================================================================
// Collapsible Section
// =============================================================================

function DockSection({
  title,
  icon,
  children,
  defaultOpen = true,
  accent,
  badge,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  accent?: 'green' | 'amber' | 'red' | 'cyan' | 'none';
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const accentColor = {
    green:  'text-scada-neon-green',
    amber:  'text-scada-neon-amber',
    red:    'text-scada-neon-red',
    cyan:   'text-scada-neon-cyan',
    none:   'text-scada-dim',
  }[accent ?? 'none'];

  return (
    <div className="border-b border-scada-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-scada-chrome transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={accentColor}>{icon}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-scada-dim">{title}</span>
          {badge && (
            <span className={clsx(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold',
              accent === 'red'   ? 'bg-scada-neon-red/15 text-scada-neon-red' :
              accent === 'amber' ? 'bg-scada-neon-amber/15 text-scada-neon-amber' :
              accent === 'green' ? 'bg-scada-neon-green/15 text-scada-neon-green' :
              'bg-scada-border text-scada-dim'
            )}>
              {badge}
            </span>
          )}
        </div>
        <IconChevronDown className={clsx('transition-transform', open && 'rotate-180', 'text-scada-muted')} />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

// =============================================================================
// Info Row
// =============================================================================

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'error' | 'muted' }) {
  const valueClass =
    tone === 'ok'    ? 'text-scada-neon-green' :
    tone === 'warn'  ? 'text-scada-neon-amber' :
    tone === 'error' ? 'text-scada-neon-red' :
    'text-scada-text';

  return (
    <div className="flex items-center justify-between px-3 py-1">
      <span className="text-[11px] text-scada-muted">{label}</span>
      <span className={clsx('text-[11px] font-medium', valueClass)}>{value}</span>
    </div>
  );
}

// =============================================================================
// Action Button
// =============================================================================

function DockAction({
  label,
  description,
  onClick,
  variant = 'default',
  disabled = false,
  testId,
}: {
  label: string;
  description?: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded-none',
        disabled && 'cursor-not-allowed opacity-40',
        !disabled && variant === 'primary' && 'hover:bg-scada-neon-green/10',
        !disabled && variant === 'danger'  && 'hover:bg-scada-neon-red/10',
        !disabled && variant === 'default' && 'hover:bg-scada-chrome',
      )}
    >
      <IconArrowRight className={clsx(
        'shrink-0',
        variant === 'primary' ? 'text-scada-neon-green' :
        variant === 'danger'  ? 'text-scada-neon-red' :
        'text-scada-muted'
      )} />
      <div className="min-w-0">
        <div className={clsx(
          'text-[11px] font-medium',
          variant === 'primary' ? 'text-scada-neon-green' :
          variant === 'danger'  ? 'text-scada-neon-red' :
          'text-scada-text'
        )}>{label}</div>
        {description && (
          <div className="text-[10px] text-scada-muted leading-tight mt-0.5">{description}</div>
        )}
      </div>
    </button>
  );
}

// =============================================================================
// Blocker Row
// =============================================================================

function BlockerRow({ message, code }: { message: string; code?: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5">
      <IconWarning className="text-scada-neon-red shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[11px] text-scada-text leading-tight">{message}</div>
        {code && <div className="text-[10px] text-scada-muted mt-0.5 font-mono">{code}</div>}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export interface EngineerWorkspaceDockProps {
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function EngineerWorkspaceDock({
  className,
  collapsed = false,
  onToggleCollapse,
}: EngineerWorkspaceDockProps) {
  const activeMode = useActiveMode();
  const resultStatusLabel = useResultStatusLabel();
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const caseName    = useAppStateStore((state) => state.activeCaseName);
  const resultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const activeSnapshotId = useAppStateStore((state) => state.activeSnapshotId);
  const readiness = useSnapshotStore((state) => state.readiness);
  const networkStats = useNetworkStats();
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  const blockers = readiness?.blockers ?? [];
  const blockerCount = blockers.length;
  const isModelReady = readiness?.ready ?? false;

  const handleOpenReadiness = useCallback(() => {
    openRouteSurface('E-04', {
      titlePl: 'Gotowość modelu i lista braków',
      sizeClass: 'B',
      openMode: 'replace_right_panel',
      supportsMiniSld: false,
      tabId: 'braki',
      subjectKind: 'analysis_case',
      subjectRef: activeSnapshotId,
    });
  }, [openRouteSurface, activeSnapshotId]);

  const handleOpenAssumptions = useCallback(() => {
    openRouteSurface('E-31', {
      titlePl: 'Rejestr założeń i jakości danych',
      sizeClass: 'B',
      openMode: 'replace_right_panel',
      supportsMiniSld: false,
      tabId: 'zalozenia',
      subjectKind: 'analysis_case',
      subjectRef: activeSnapshotId,
    });
  }, [openRouteSurface, activeSnapshotId]);

  const nextStepText = (() => {
    if (!projectName) return 'Otwórz lub utwórz projekt';
    if (!activeCaseId) return 'Wybierz zakres obliczeń';
    if (blockerCount > 0) return 'Usuń blokady modelu';
    if (resultStatus === 'NONE') return 'Uruchom obliczenia';
    if (resultStatus === 'OUTDATED') return 'Zaktualizuj wyniki';
    return 'Wyniki aktualne — raport gotowy';
  })();

  if (collapsed) {
    return (
      <div
        className={clsx(
          'flex w-8 shrink-0 flex-col items-center border-r border-scada-border bg-scada-panel py-2 gap-2',
          className,
        )}
        data-testid="engineer-dock-collapsed"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-6 w-6 items-center justify-center rounded text-scada-dim hover:bg-scada-chrome hover:text-scada-text transition-colors"
          title="Rozwiń panel prowadzenia pracy"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div className="h-px w-5 bg-scada-border" />
        <div title="Gotowość modelu" className={clsx(
          'h-2 w-2 rounded-full',
          isModelReady ? 'bg-scada-neon-green' : 'bg-scada-neon-red'
        )} />
        {resultStatus === 'FRESH' && (
          <div title="Wyniki aktualne" className="h-2 w-2 rounded-full bg-scada-neon-cyan" />
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'flex w-64 shrink-0 flex-col border-r border-scada-border bg-scada-panel overflow-y-auto',
        className,
      )}
      data-testid="engineer-dock"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-scada-border bg-scada-chrome">
        <div className="flex items-center gap-2">
          <IconBolt className="text-scada-neon-green" />
          <span className="text-[11px] font-bold text-scada-text uppercase tracking-wider">Workspace SN</span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-5 w-5 items-center justify-center rounded text-scada-muted hover:text-scada-text transition-colors"
          title="Zwiń panel"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* 1. Kontekst pracy */}
      <DockSection title="Kontekst pracy" icon={<IconNetwork />} accent="cyan">
        <InfoRow label="Projekt" value={projectName ?? '— brak —'} />
        <InfoRow label="Zakres obliczeń" value={caseName ?? '— nie wybrano —'} tone={caseName ? undefined : 'warn'} />
        <InfoRow
          label="Stan wyników"
          value={resultStatusLabel}
          tone={resultStatus === 'FRESH' ? 'ok' : resultStatus === 'OUTDATED' ? 'warn' : 'muted'}
        />
        <InfoRow
          label="Tryb pracy"
          value={activeMode === 'RESULT_VIEW' ? 'Wyniki obliczeń' : 'Edycja modelu'}
          tone={activeMode === 'RESULT_VIEW' ? 'ok' : undefined}
        />
      </DockSection>

      {/* 2. Następny krok */}
      <DockSection title="Następny krok" icon={<IconArrowRight />} accent="green">
        <div className="flex items-start gap-2 px-3 py-2">
          <div className={clsx(
            'mt-0.5 h-2 w-2 rounded-full shrink-0',
            blockerCount > 0 ? 'bg-scada-neon-red animate-pulse' :
            resultStatus === 'NONE' ? 'bg-scada-neon-amber' :
            'bg-scada-neon-green'
          )} />
          <p className="text-[11px] text-scada-text leading-relaxed">{nextStepText}</p>
        </div>
      </DockSection>

      {/* 3. Blokady i naprawy */}
      <DockSection
        title="Blokady"
        icon={<IconWarning />}
        accent={blockerCount > 0 ? 'red' : 'none'}
        badge={blockerCount > 0 ? String(blockerCount) : undefined}
        defaultOpen={blockerCount > 0}
      >
        {blockerCount === 0 ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <IconCheck className="text-scada-neon-green" />
            <span className="text-[11px] text-scada-neon-green">Brak aktywnych blokad</span>
          </div>
        ) : (
          <>
            {blockers.slice(0, 5).map((blocker, i) => (
              <BlockerRow key={i} message={blocker.message_pl ?? 'Blokada bez opisu'} code={blocker.code} />
            ))}
            {blockerCount > 5 && (
              <div className="px-3 py-1.5 text-[10px] text-scada-muted">
                +{blockerCount - 5} więcej blokad…
              </div>
            )}
            <DockAction
              label="Otwórz listę braków"
              description="E-04 — gotowość modelu"
              onClick={handleOpenReadiness}
              variant="primary"
            />
          </>
        )}
      </DockSection>

      {/* 4. Działania dostępne */}
      <DockSection title="Działania" icon={<IconBolt />} accent="cyan">
        <DockAction
          label="Zmień zakres obliczeń"
          onClick={() => navigateToVariants({ caseId: activeCaseId })}
          testId="dock-action-change-case"
        />
        <DockAction
          label="Warunki obliczeń"
          onClick={() => navigateToCaseConfig({ caseId: activeCaseId })}
          testId="dock-action-case-config"
        />
        <DockAction
          label="Jakość danych i założenia"
          onClick={handleOpenAssumptions}
          testId="dock-action-assumptions"
        />
      </DockSection>

      {/* 5. Stan modelu */}
      <DockSection title="Stan modelu" icon={<IconCheck />} accent={isModelReady ? 'green' : 'amber'}>
        <InfoRow label="Węzły sieci" value={String(networkStats?.nodeCount ?? 0)} />
        <InfoRow label="Gałęzie" value={String(networkStats?.branchCount ?? 0)} />
        <InfoRow
          label="Gotowość obliczeniowa"
          value={isModelReady ? 'Gotowy' : `${blockerCount} blokad`}
          tone={isModelReady ? 'ok' : 'error'}
        />
      </DockSection>
    </div>
  );
}

export default EngineerWorkspaceDock;
