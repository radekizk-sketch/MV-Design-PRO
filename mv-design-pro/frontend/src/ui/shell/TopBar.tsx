/**
 * TopBar - compact V12 application chrome inspired by the MV-DESIGN-PRO mockup.
 *
 * The visible UI is a single operational strip. Work modes are still available
 * through F2..F7 and through the main actions, but the old second-row mode
 * switcher is intentionally not rendered.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { useAppStateStore, useCanCalculate } from '../app-state/store';
import type { WorkMode } from '../app-state/store';
import type { ResultStatus } from '../types';
import { navigateToCaseConfig, navigateToVariants } from '../navigation/routes';
import { useHistoryState } from '../history/hooks';

interface WorkModeDef {
  code: WorkMode;
  key: string;
}

const WORK_MODES: WorkModeDef[] = [
  { code: 'TE', key: 'F2' },
  { code: 'TW', key: 'F3' },
  { code: 'TZ', key: 'F4' },
  { code: 'TP', key: 'F5' },
  { code: 'TA', key: 'F6' },
  { code: 'TN', key: 'F7' },
];

const RESULT_STATUS_CONFIG: Record<ResultStatus, { label: string; tone: string }> = {
  NONE: {
    label: 'Brak wyników',
    tone: 'text-scada-muted',
  },
  FRESH: {
    label: 'Wyniki aktualne',
    tone: 'text-[#00ffaa]',
  },
  OUTDATED: {
    label: 'Wyniki nieaktualne',
    tone: 'text-amber-300',
  },
};

function ServerClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="font-mono-eng text-[10px] text-scada-muted tabular-nums">{time}</span>;
}

function BrandBlock() {
  return (
    <div className="flex h-full w-[136px] shrink-0 flex-col justify-center border-r border-[#10263d] px-4">
      <span className="font-mono-eng text-[9px] font-semibold uppercase tracking-[0.22em] text-[#73a8d7]">
        MV-DESIGN-PRO
      </span>
      <span className="font-mono-eng text-[20px] font-bold leading-5 text-[#9ecbff]">12.2</span>
    </div>
  );
}

function ContextBlock({
  testId,
  label,
  value,
  onClick,
  wide = false,
}: {
  testId: string;
  label: string;
  value: string;
  onClick?: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={clsx(
        'flex h-full min-w-[112px] flex-col justify-center border-r border-[#10263d] px-4 text-left transition-colors hover:bg-[#0b1725]',
        wide ? 'w-[224px]' : 'w-[164px]',
      )}
    >
      <span className="font-mono-eng text-[10px] uppercase tracking-[0.18em] text-[#6d8fb3]">
        {label}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-2 font-mono-eng text-[13px] font-semibold text-scada-text">
        <span className="truncate">{value}</span>
        {onClick && <ChevronDown className="shrink-0" />}
      </span>
    </button>
  );
}

function ResultStatus({ status }: { status: ResultStatus }) {
  const config = RESULT_STATUS_CONFIG[status];
  return (
    <div
      data-testid="top-bar-result-status"
      className="flex h-full min-w-[136px] items-center gap-2 border-r border-[#10263d] px-4"
      title={config.label}
    >
      <span
        className={clsx(
          'h-2.5 w-2.5 rounded-full',
          status === 'FRESH'
            ? 'bg-[#00ffaa]'
            : status === 'OUTDATED'
              ? 'bg-amber-400'
              : 'border border-scada-muted',
        )}
        aria-hidden="true"
      />
      <span className={clsx('font-mono-eng text-[12px] font-semibold', config.tone)}>
        {config.label}
      </span>
    </div>
  );
}

interface TopBarProps {
  projectName?: string;
  onMenuAction?: (actionId: string) => void;
  onCalculate?: () => void;
  onViewResults?: () => void;
}

export function TopBar({
  projectName,
  onMenuAction,
  onCalculate,
  onViewResults,
}: TopBarProps) {
  const setActiveWorkMode = useAppStateStore((s) => s.setActiveWorkMode);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const activeVariantName = useAppStateStore((s) => s.activeVariantName);
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);
  const { allowed: canCalculate, reason: calculateBlockedReason } = useCanCalculate();
  const { undo, redo } = useHistoryState();

  const displayProjectName = activeProjectName || projectName || '— nie otwarto —';
  const scopeDisplay = activeCaseName || activeVariantName
    ? [activeCaseName, activeVariantName].filter(Boolean).join(' · ')
    : '— skonfiguruj projekt —';

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isCtrlOrMeta = event.ctrlKey || event.metaKey;
      // F2–F7: przelączniki trybów pracy
      const mode = WORK_MODES.find((entry) => entry.key === event.key);
      if (mode && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        setActiveWorkMode(mode.code);
        return;
      }
      // Ctrl+Z / Cmd+Z: Cofnij
      if (isCtrlOrMeta && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (undo.isEnabled) void undo.execute();
        return;
      }
      // Ctrl+Y / Cmd+Shift+Z: Ponów
      if (
        (event.ctrlKey && event.key === 'y') ||
        (event.metaKey && event.shiftKey && event.key === 'z')
      ) {
        event.preventDefault();
        if (redo.isEnabled) void redo.execute();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveWorkMode, undo, redo]);

  const handleCalculate = useCallback(() => {
    if (!canCalculate) {
      onMenuAction?.('readiness');
      return;
    }
    onCalculate?.();
  }, [canCalculate, onCalculate, onMenuAction]);

  const handleOverlay = useCallback(() => {
    setActiveWorkMode('TW');
    onViewResults?.();
  }, [onViewResults, setActiveWorkMode]);

  const handleAnalysis = useCallback(() => {
    setActiveWorkMode('TA');
    onViewResults?.();
  }, [onViewResults, setActiveWorkMode]);

  const handleExport = useCallback(() => {
    onMenuAction?.('export');
  }, [onMenuAction]);

  const handleSettings = useCallback(() => {
    onMenuAction?.('settings');
  }, [onMenuAction]);

  const dateDisplay = useMemo(() => (
    new Date().toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  ), []);

  return (
    <header
      data-testid="top-bar-v12"
      className="flex h-[70px] shrink-0 items-stretch border-b border-[#10263d] bg-[#050810] text-scada-text select-none"
    >
      <BrandBlock />

      <div
        data-testid="context-triple"
        aria-label="Kontekst projektu"
        className="flex min-w-0 flex-1 items-stretch"
      >
        <ContextBlock testId="ctx-project" label="Projekt" value={displayProjectName} />
        <ContextBlock
          testId="ctx-wariant"
          label="Cel / stan"
          value={scopeDisplay}
          onClick={() => navigateToVariants({ caseId: activeCaseId })}
          wide
        />
        <button
          type="button"
          data-testid="ctx-przypadek"
          onClick={() => navigateToCaseConfig({ caseId: activeCaseId })}
          className="sr-only"
        >
          Konfiguruj zakres
        </button>
        <ResultStatus status={resultStatus} />
      </div>

      <div className="flex shrink-0 items-center gap-4 border-r border-[#10263d] px-4">
        <div className="flex flex-col items-end leading-none">
          <ServerClock />
          <span className="mt-1 font-mono-eng text-[9px] text-scada-muted">{dateDisplay}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3">
        {/* Cofnij / Ponów — skróty Ctrl+Z / Ctrl+Y */}
        <button
          type="button"
          data-testid="top-bar-undo"
          aria-label={undo.tooltip}
          title={undo.tooltip}
          disabled={!undo.isEnabled}
          onClick={() => { if (undo.isEnabled) void undo.execute(); }}
          className={clsx(
            'grid h-10 w-10 place-items-center rounded-[4px] border text-[16px] leading-none transition-colors',
            undo.isEnabled
              ? 'border-[#15324f] text-[#7fb0dd] hover:bg-[#0b2135] hover:text-scada-text'
              : 'border-[#15324f]/40 text-scada-muted/30 cursor-not-allowed',
          )}
        >
          ↶
        </button>
        <button
          type="button"
          data-testid="top-bar-redo"
          aria-label={redo.tooltip}
          title={redo.tooltip}
          disabled={!redo.isEnabled}
          onClick={() => { if (redo.isEnabled) void redo.execute(); }}
          className={clsx(
            'grid h-10 w-10 place-items-center rounded-[4px] border text-[16px] leading-none transition-colors',
            redo.isEnabled
              ? 'border-[#15324f] text-[#7fb0dd] hover:bg-[#0b2135] hover:text-scada-text'
              : 'border-[#15324f]/40 text-scada-muted/30 cursor-not-allowed',
          )}
        >
          ↷
        </button>

        <button
          type="button"
          data-testid="top-bar-calculate"
          title={canCalculate ? 'Wykonaj analizę' : calculateBlockedReason ?? 'Analiza jest zablokowana'}
          onClick={handleCalculate}
          aria-label={canCalculate ? 'Wykonaj analizę' : 'Sprawdź braki danych'}
          className={clsx(
            'flex h-10 items-center gap-2 rounded-[4px] px-4 font-mono-eng text-[13px] font-bold transition-colors',
            canCalculate
              ? 'bg-[#00ffaa] text-[#00110b] shadow-[0_0_22px_rgba(0,255,170,0.28)] hover:bg-[#31ffba]'
              : 'border border-amber-500/40 bg-[#172334] text-amber-200 shadow-none hover:bg-[#203044]',
          )}
        >
          <IconPlay />
          <span>{canCalculate ? 'Oblicz' : 'Sprawdź braki'}</span>
          <ChevronDown className={canCalculate ? 'text-[#00110b]' : 'text-[#7c91a3]'} />
        </button>

        <button
          type="button"
          data-testid="top-bar-overlay"
          onClick={handleOverlay}
          className="flex h-10 items-center gap-2 rounded-[4px] bg-[#0b2135] px-3 font-mono-eng text-[12px] font-semibold text-[#67d9ff] transition-colors hover:bg-[#113451]"
        >
          <span>Nakładka</span>
          <ChevronDown />
        </button>

        <button
          type="button"
          data-testid="top-bar-results"
          onClick={handleAnalysis}
          className="flex h-10 items-center gap-2 rounded-[4px] bg-[#0b2135] px-3 font-mono-eng text-[12px] font-semibold text-[#67d9ff] transition-colors hover:bg-[#113451]"
        >
          <span>Analizy</span>
          <IconArrowRight />
        </button>

        <button
          type="button"
          data-testid="top-bar-export"
          onClick={handleExport}
          className="flex h-10 items-center gap-2 rounded-[4px] bg-[#0b2135] px-3 font-mono-eng text-[12px] font-semibold text-[#67d9ff] transition-colors hover:bg-[#113451]"
        >
          <span>Eksport</span>
          <ChevronDown />
        </button>

        <button
          type="button"
          data-testid="top-bar-settings"
          aria-label="Ustawienia"
          title="Ustawienia"
          onClick={handleSettings}
          className="grid h-10 w-10 place-items-center rounded-[4px] border border-[#15324f] text-[#7fb0dd] transition-colors hover:bg-[#0b2135] hover:text-scada-text"
        >
          <IconGear />
        </button>
      </div>
    </header>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('h-3 w-3 text-current', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  );
}
