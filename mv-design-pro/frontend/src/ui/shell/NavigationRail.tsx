/**
 * NavigationRail — V12 lewy pas nawigacyjny (56px)
 *
 * 7 obszarów aplikacji (MO/AN/ZA/OZ/RA/AD/HI) + ustawienia u dołu.
 * Przełączanie obszaru: klik lewym / Ctrl+1..7.
 */

import { useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStateStore } from '../app-state/store';
import type { AreaCode } from '../app-state/store';

interface AreaDef {
  code: AreaCode;
  labelPl: string;
  shortcut: string;
  icon: React.ReactNode;
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function IconDocument({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconWrench({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={clsx('h-5 w-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

const AREAS: AreaDef[] = [
  { code: 'MO', labelPl: 'Model sieci', shortcut: 'Ctrl+1', icon: <IconGrid /> },
  { code: 'AN', labelPl: 'Analizy', shortcut: 'Ctrl+2', icon: <IconChart /> },
  { code: 'ZA', labelPl: 'Zabezpieczenia i automatyka', shortcut: 'Ctrl+3', icon: <IconShield /> },
  { code: 'OZ', labelPl: 'Źródła i profile', shortcut: 'Ctrl+4', icon: <IconSun /> },
  { code: 'RA', labelPl: 'Raporty', shortcut: 'Ctrl+5', icon: <IconDocument /> },
  { code: 'AD', labelPl: 'Administracja', shortcut: 'Ctrl+6', icon: <IconWrench /> },
  { code: 'HI', labelPl: 'Historia i audyt', shortcut: 'Ctrl+7', icon: <IconClock /> },
];

export function NavigationRail() {
  const activeArea = useAppStateStore((s) => s.activeArea);
  const setActiveArea = useAppStateStore((s) => s.setActiveArea);

  // Klawisze Ctrl+1..7
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < AREAS.length) {
        e.preventDefault();
        setActiveArea(AREAS[idx].code);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveArea]);

  const handleAreaClick = useCallback(
    (code: AreaCode) => setActiveArea(code),
    [setActiveArea],
  );

  return (
    <nav
      data-testid="navigation-rail"
      aria-label="Nawigacja obszarów aplikacji"
      className="flex w-14 shrink-0 flex-col items-center border-r border-scada-border bg-scada-surface py-2"
    >
      {/* Area buttons */}
      <div className="flex flex-1 flex-col items-center gap-1 pt-1">
        {AREAS.map((area) => {
          const isActive = activeArea === area.code;
          return (
            <button
              key={area.code}
              type="button"
              data-testid={`nav-area-${area.code}`}
              data-area={area.code}
              aria-label={`${area.labelPl} (${area.shortcut})`}
              title={`${area.labelPl}\n${area.shortcut}`}
              onClick={() => handleAreaClick(area.code)}
              className={clsx(
                'relative flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                isActive
                  ? 'bg-scada-active text-scada-sn'
                  : 'text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text',
              )}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-scada-sn"
                  aria-hidden="true"
                />
              )}
              {area.icon}
              {/* Kod obszaru pod ikoną */}
              <span className="absolute bottom-0.5 text-[8px] font-bold tracking-wider">
                {area.code}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
