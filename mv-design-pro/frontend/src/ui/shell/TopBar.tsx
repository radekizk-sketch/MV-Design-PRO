/**
 * TopBar — górny pasek kontekstu projektu i trybów pracy.
 *
 * Tryby pracy (etykiety widoczne dla inżyniera, kody to wewnętrzne ID):
 *   F2  Edycja modelu          (kod TE)
 *   F3  Wyniki na SLD          (kod TW)
 *   F4  Zabezpieczenia         (kod TZ)
 *   F5  Porównanie wariantów   (kod TP)
 *   F6  Audyt obliczeń         (kod TA)
 *   F7  Stan operatorski       (kod TN)
 *
 * Trzy strefy paska:
 * - lewa: nazwa projektu + Przypadek/Wariant/Migawka
 * - środkowa: status wyników (FRESH/OUTDATED/NONE)
 * - prawa: zegar serwera, przycisk Oblicz, przycisk Wyniki, ustawienia
 */

import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStateStore } from '../app-state/store';
import type { WorkMode } from '../app-state/store';
import type { ResultStatus } from '../types';
import { navigateToCaseConfig, navigateToVariants } from '../navigation/routes';

interface WorkModeDef {
  code: WorkMode;
  labelPl: string;
  labelShort: string;
  key: string;
  title: string;
}

const WORK_MODES: WorkModeDef[] = [
  { code: 'TE', labelPl: 'Edycja modelu', labelShort: 'Edycja', key: 'F2', title: 'Edycja modelu sieci' },
  { code: 'TW', labelPl: 'Wyniki na SLD', labelShort: 'Wyniki', key: 'F3', title: 'Nakładki obliczeniowe na SLD' },
  { code: 'TZ', labelPl: 'Zabezpieczenia', labelShort: 'Zabezpieczenia', key: 'F4', title: 'Nastawy, krzywe t-I, selektywność' },
  { code: 'TP', labelPl: 'Porównanie wariantów', labelShort: 'Porównanie', key: 'F5', title: 'Porównanie wariantów pracy' },
  { code: 'TA', labelPl: 'Audyt', labelShort: 'Audyt', key: 'F6', title: 'Pochodzenie wartości i ślad obliczeń' },
  { code: 'TN', labelPl: 'Stan operatorski', labelShort: 'Operator', key: 'F7', title: 'Stan operatorski' },
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

function ServerDate() {
  const [date, setDate] = useState(() => new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  useEffect(() => {
    const id = setInterval(() => {
      setDate(new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-[10px] text-scada-muted">{date}</span>;
}

const RESULT_STATUS_CONFIG: Record<ResultStatus, { label: string; className: string }> = {
  NONE: {
    label: 'Brak wyników',
    className: 'border-scada-border bg-scada-bg text-scada-muted',
  },
  FRESH: {
    label: 'Wyniki aktualne',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  OUTDATED: {
    label: 'Wyniki nieaktualne',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
};

function ResultStatusChip({ status }: { status: ResultStatus }) {
  const { className } = RESULT_STATUS_CONFIG[status];
  const label = status === 'OUTDATED'
    ? 'Nieakt.'
    : status === 'NONE'
      ? 'Brak'
      : 'OK';
  return (
    <div
      data-testid="top-bar-result-status"
      title={RESULT_STATUS_CONFIG[status].label}
      className={clsx(
        'flex h-7 items-center gap-1.5 rounded border px-2.5 text-[10px] font-semibold',
        className,
      )}
    >
      <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[8px] leading-none">
        {status === 'NONE' ? '—' : '✓'}
      </span>
      {label}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex h-10 w-[210px] shrink-0 items-center gap-2.5">
      <svg className="h-8 w-8 text-cyan-400" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M4 27V5l12 10L28 5v22" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <path d="M8 13v14M24 13v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="whitespace-nowrap text-[20px] font-semibold leading-none tracking-normal text-scada-text">
        MV-DESIGN <span className="text-cyan-400">PRO</span>
      </div>
    </div>
  );
}

function ContextSelectorButton({
  testId,
  label,
  value,
  onClick,
  monospace = false,
  wide = false,
}: {
  testId: string;
  label: string;
  value: string;
  onClick?: () => void;
  monospace?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={clsx(
        'group flex h-[42px] flex-col justify-center rounded-sm border border-scada-border bg-[#08121a] px-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-cyan-500/55',
        wide ? 'w-[176px]' : 'w-[136px]',
      )}
    >
      <span className="text-[10px] leading-none text-scada-muted">{label}</span>
      <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] font-semibold leading-none text-scada-text">
        <span className={clsx('truncate', monospace && 'font-mono')}>{value}</span>
        <ChevronDown />
      </span>
    </button>
  );
}

interface TopBarProps {
  projectName?: string;
  onMenuAction?: (actionId: string) => void;
  onCalculate?: () => void;
  onViewResults?: () => void;
}

export function TopBar({ projectName, onCalculate, onViewResults }: TopBarProps) {
  const activeWorkMode = useAppStateStore((s) => s.activeWorkMode);
  const setActiveWorkMode = useAppStateStore((s) => s.setActiveWorkMode);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const activeVariantName = useAppStateStore((s) => s.activeVariantName);
  const activeSnapshotId = useAppStateStore((s) => s.activeSnapshotId);
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);

  const displayProjectName = activeProjectName || projectName || '— nie otwarto —';
  const snapshotDisplay = activeSnapshotId
    ? activeSnapshotId.length > 10 ? `${activeSnapshotId.slice(0, 10)}…` : activeSnapshotId
    : '— nie wybrano —';

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
      className="flex shrink-0 flex-col border-b border-scada-border bg-[#08131b] select-none"
    >
      <div className="flex h-[56px] shrink-0 items-center gap-4 px-3">
        <BrandMark />

        <div
          className="flex min-w-0 flex-1 items-center gap-3"
          data-testid="context-triple"
          aria-label="Kontekst obliczeniowy"
        >
          <ContextSelectorButton
            testId="ctx-project"
            label="Projekt"
            value={displayProjectName}
          />
          <ContextSelectorButton
            testId="ctx-przypadek"
            label="Przypadek"
            value={activeCaseName || '— nie wybrano —'}
            onClick={() => navigateToCaseConfig({ caseId: activeCaseId })}
            wide
          />
          <ContextSelectorButton
            testId="ctx-wariant"
            label="Wariant"
            value={activeVariantName || '— nie wybrano —'}
            onClick={() => navigateToVariants({ caseId: activeCaseId })}
            wide
          />
          <ContextSelectorButton
            testId="ctx-migawka"
            label="Migawka"
            value={snapshotDisplay}
            monospace
            wide
          />
          <div className="h-8 w-px bg-scada-border" aria-hidden="true" />
          <div className="flex h-10 flex-col justify-center">
            <span className="text-[10px] leading-none text-scada-muted">Wyniki</span>
            <div className="mt-1">
              <ResultStatusChip status={resultStatus} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="h-8 w-px bg-scada-border" aria-hidden="true" />
          <div className="flex min-w-[72px] flex-col items-start gap-0.5">
            <ServerClock />
            <ServerDate />
          </div>

          <button
            type="button"
            data-testid="top-bar-calculate"
            title="Uruchom analizę aktywną (F8)"
            onClick={handleCalculate}
            className="flex h-[42px] items-center gap-2 rounded-sm border border-cyan-500/70 bg-cyan-500/20 px-3 text-[12px] font-semibold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(34,211,238,0.12)] transition-colors hover:bg-cyan-500/30"
          >
            <IconPlay />
            <span>Oblicz</span>
          </button>

          <div className="flex h-[42px] overflow-hidden rounded-sm border border-scada-border bg-[#0a151f]">
            <button
              type="button"
              data-testid="top-bar-results"
              title="Pokaż wyniki na SLD"
              onClick={handleViewResults}
              className="flex items-center gap-2 px-3 text-[12px] font-semibold text-scada-muted transition-colors hover:bg-scada-active hover:text-scada-text"
            >
              <IconResults />
              <span>Wyniki</span>
            </button>
            <button
              type="button"
              aria-label="Menu wyników"
              title="Menu wyników"
              className="grid w-10 place-items-center border-l border-scada-border text-scada-muted transition-colors hover:bg-scada-active hover:text-scada-text"
            >
              <ChevronDown />
            </button>
          </div>

          <button
            type="button"
            aria-label="Ustawienia"
            title="Ustawienia"
            className="grid h-[42px] w-[42px] place-items-center rounded-sm text-scada-muted transition-colors hover:bg-scada-active hover:text-scada-text"
          >
            <IconGear />
          </button>
        </div>
      </div>

      <div className="flex h-[40px] shrink-0 items-center border-t border-scada-border bg-[#0a151e] px-3">
        <span className="mr-4 text-[11px] text-scada-muted">Tryb pracy</span>
        <div
          role="group"
          aria-label="Tryb pracy schematu"
          className="flex h-[32px] items-center overflow-hidden rounded-sm border border-scada-border bg-[#071018]"
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
                  'h-[32px] min-w-[120px] border-r border-scada-border px-4 text-[12px] font-semibold tracking-normal transition-colors last:border-r-0',
                  isActive
                    ? MODE_ACTIVE_COLOR[m.code]
                    : 'text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text',
                )}
              >
                {m.labelShort}
              </button>
            );
          })}
        </div>
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

function IconGear() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
