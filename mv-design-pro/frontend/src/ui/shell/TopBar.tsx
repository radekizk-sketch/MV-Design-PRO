/**
 * TopBar — V12 górny pasek kontekstu i trybów (48px)
 *
 * Trzy strefy:
 * - Lewa:  nazwa projektu + przełącznik trybów roboczych (TE/TW/TZ/TP/TA/TN)
 * - Środkowa: Przypadek ▼  Wariant ▼  Migawka ▼  (zawsze widoczne)
 * - Prawa: użytkownik, zegar, zapisz
 *
 * Skróty: F2=TE, F3=TW, F4=TZ, F5=TP, F6=TA, F7=TN
 */

import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStateStore } from '../app-state/store';
import type { WorkMode } from '../app-state/store';
import { navigateToCaseConfig, navigateToVariants } from '../navigation/routes';

interface WorkModeDef {
  code: WorkMode;
  labelPl: string;
  key: string;
  title: string;
}

const WORK_MODES: WorkModeDef[] = [
  { code: 'TE', labelPl: 'Edycja',        key: 'F2', title: 'Edycja CAD modelu sieci' },
  { code: 'TW', labelPl: 'Wyniki',        key: 'F3', title: 'Nakładki obliczeniowe na SLD' },
  { code: 'TZ', labelPl: 'Zabezpieczenia', key: 'F4', title: 'Nastawy, krzywe t-I, selektywność' },
  { code: 'TP', labelPl: 'Porównanie',    key: 'F5', title: 'Porównanie wariantów A/B/N' },
  { code: 'TA', labelPl: 'Audyt',         key: 'F6', title: 'Pochodzenie wartości i trace' },
  { code: 'TN', labelPl: 'Operator',      key: 'F7', title: 'Stan operatorski nocny' },
];

const MODE_ACTIVE_COLOR: Record<WorkMode, string> = {
  TE: 'bg-scada-active text-scada-sn border-scada-sn',
  TW: 'bg-[#0A2A1A] text-scada-energized border-scada-energized',
  TZ: 'bg-[#2A1A0A] text-scada-grounded border-scada-grounded',
  TP: 'bg-[#1A0A2A] text-[#C084FC] border-[#C084FC]',
  TA: 'bg-[#1A1A0A] text-[#FFD400] border-[#FFD400]',
  TN: 'bg-[#0A0A1A] text-scada-muted border-scada-border',
};

function ServerClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-[11px] text-scada-muted tabular-nums">{time}</span>;
}

interface TopBarProps {
  projectName?: string;
  onMenuAction?: (actionId: string) => void;
  onCalculate?: () => void;
  onViewResults?: () => void;
}

export function TopBar({ projectName = 'Nowy projekt', onCalculate, onViewResults }: TopBarProps) {
  const activeWorkMode = useAppStateStore((s) => s.activeWorkMode);
  const setActiveWorkMode = useAppStateStore((s) => s.setActiveWorkMode);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const activeVariantName = useAppStateStore((s) => s.activeVariantName);
  const activeSnapshotId = useAppStateStore((s) => s.activeSnapshotId);
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);

  const displayProjectName = activeProjectName || projectName;
  const snapshotDisplay = activeSnapshotId
    ? activeSnapshotId.length > 10 ? `${activeSnapshotId.slice(0, 10)}…` : activeSnapshotId
    : 'Normalna';

  // Skróty klawiszowe F2..F7
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const idx = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7'].indexOf(e.key);
      if (idx >= 0 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setActiveWorkMode(WORK_MODES[idx].code);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveWorkMode]);

  const handleCalculate = useCallback(() => {
    onCalculate?.();
  }, [onCalculate]);

  const handleViewResults = useCallback(() => {
    onViewResults?.();
  }, [onViewResults]);

  return (
    <header
      data-testid="top-bar-v12"
      className="flex h-12 shrink-0 items-center justify-between border-b border-scada-border bg-scada-surface px-3 select-none"
    >
      {/* === LEWA: projekt + tryby === */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex min-w-0 flex-col" data-testid="top-bar-project">
          <span className="truncate text-[11px] font-semibold text-scada-text max-w-[180px]">
            {displayProjectName}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-scada-muted">Projekt</span>
        </div>

        <div className="h-6 w-px bg-scada-border" aria-hidden="true" />

        {/* Przełącznik trybów */}
        <div
          role="group"
          aria-label="Tryb pracy schematu"
          className="flex items-center gap-0.5 rounded-md bg-scada-bg p-0.5"
          data-testid="work-mode-switcher"
        >
          {WORK_MODES.map((m) => {
            const isActive = activeWorkMode === m.code;
            return (
              <button
                key={m.code}
                type="button"
                data-testid={`work-mode-${m.code}`}
                data-mode={m.code}
                aria-pressed={isActive}
                aria-label={`${m.labelPl} (${m.key})`}
                title={`${m.labelPl}\n${m.key} — ${m.title}`}
                onClick={() => setActiveWorkMode(m.code)}
                className={clsx(
                  'rounded border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
                  isActive
                    ? MODE_ACTIVE_COLOR[m.code]
                    : 'border-transparent text-scada-muted hover:text-scada-text hover:bg-scada-hover-nav',
                )}
              >
                {m.code}
              </button>
            );
          })}
        </div>
      </div>

      {/* === ŚRODKOWA: Przypadek / Wariant / Migawka === */}
      <div
        className="flex items-center gap-1.5"
        data-testid="context-triple"
        aria-label="Kontekst obliczeniowy"
      >
        {/* Przypadek */}
        <button
          type="button"
          data-testid="ctx-przypadek"
          title="Aktywny przypadek obliczeniowy — kliknij, by zmienić"
          onClick={() => navigateToCaseConfig({ caseId: activeCaseId })}
          className={clsx(
            'flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] transition-colors',
            activeCaseId
              ? 'border-scada-border bg-scada-bg text-scada-text hover:border-scada-sn'
              : 'border-dashed border-scada-border bg-transparent text-scada-muted hover:border-scada-text',
          )}
        >
          <span className="text-[9px] uppercase tracking-widest text-scada-muted">Przypadek</span>
          <span className="font-semibold">{activeCaseName || '— nie wybrano —'}</span>
          <ChevronDown />
        </button>

        <span className="text-scada-border" aria-hidden="true">·</span>

        {/* Wariant */}
        <button
          type="button"
          data-testid="ctx-wariant"
          title="Aktywny wariant pracy — kliknij, by zmienić"
          onClick={() => navigateToVariants({ caseId: activeCaseId })}
          className="flex items-center gap-1.5 rounded border border-scada-border bg-scada-bg px-2.5 py-1 text-[10px] text-scada-text transition-colors hover:border-scada-sn"
        >
          <span className="text-[9px] uppercase tracking-widest text-scada-muted">Wariant</span>
          <span className="font-semibold">{activeVariantName || 'Bazowy'}</span>
          <ChevronDown />
        </button>

        <span className="text-scada-border" aria-hidden="true">·</span>

        {/* Migawka */}
        <button
          type="button"
          data-testid="ctx-migawka"
          title="Migawka stanu łączników — kliknij, by zmienić"
          className="flex items-center gap-1.5 rounded border border-scada-border bg-scada-bg px-2.5 py-1 text-[10px] text-scada-text transition-colors hover:border-scada-sn"
        >
          <span className="text-[9px] uppercase tracking-widest text-scada-muted">Migawka</span>
          <span className="font-mono font-semibold">{snapshotDisplay}</span>
          <ChevronDown />
        </button>
      </div>

      {/* === PRAWA: akcje systemowe === */}
      <div className="flex items-center gap-2.5">
        <ServerClock />

        <div className="h-4 w-px bg-scada-border" aria-hidden="true" />

        {/* Oblicz */}
        <button
          type="button"
          data-testid="top-bar-calculate"
          title="Uruchom analizę aktywną (F8)"
          onClick={handleCalculate}
          className="flex items-center gap-1.5 rounded border border-scada-energized px-2.5 py-1 text-[10px] font-semibold text-scada-energized transition-colors hover:bg-scada-energized hover:text-scada-bg"
        >
          <IconPlay />
          <span>Oblicz</span>
        </button>

        {/* Wyniki */}
        <button
          type="button"
          data-testid="top-bar-results"
          title="Pokaż wyniki na SLD"
          onClick={handleViewResults}
          className="flex items-center gap-1.5 rounded border border-scada-border px-2.5 py-1 text-[10px] text-scada-muted transition-colors hover:border-scada-sn hover:text-scada-text"
        >
          <IconResults />
          <span>Wyniki</span>
        </button>
      </div>
    </header>
  );
}

function ChevronDown() {
  return (
    <svg className="h-3 w-3 text-scada-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconResults() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}
