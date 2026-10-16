/*
 * Pasek stanu — TRZECI z trzech pasów powłoki (karta K1 POWLOKA, kontrakt UIUX
 * przemysłowy UI-01 i §9). Rola ARIA `status`.
 *
 * Od lewej: połączenie z serwerem (czerwone + „Połącz ponownie" przy błędzie) ·
 * rewizja modelu (→ zakładka „Dziennik operacji") · GOTOWOŚĆ — jedyne miejsce
 * gotowości w chromie, prowadzi do przestrzeni „Gotowość" · przebieg: trwający
 * bieg z rodzajem analizy i stanem (§9: stan obliczeń widoczny globalnie) albo
 * ostatni zakończony (→ zakładka „Przebiegi") · wersja modelu — skrócony odcisk
 * SHA-256 migawki (K6/H-6 R4).
 */

import type { ShellStatusInfo, BackendStatus } from './shellStatus';
import { shortFingerprint } from './shellStatus';
import type { BottomPanelTab } from './useShellStore';
import { SHELL_STRINGS, modelRevisionLabel, readinessLabel, runInProgressLabel, runLabel } from './strings';
import type { PodsumowanieGotowosci } from '../spaces/gotowosc/adapters/gotowoscAdapter';

export interface StanBiegu {
  trwa: boolean;
  /** Rodzaj analizy trwającego biegu (etykieta PL) — `null` gdy nieznany. */
  analiza: string | null;
  /** Stan trwającego biegu (etykieta PL: w kolejce / liczy się). */
  stan: string | null;
}

interface StatusBarProps {
  status: ShellStatusInfo;
  gotowosc: PodsumowanieGotowosci;
  /** Projekt otwarty — bez projektu gotowość nie istnieje (kreska braku danej). */
  projektOtwarty: boolean;
  bieg: StanBiegu;
  onReconnect?: () => void;
  onOpenBottomPanel?: (tab: BottomPanelTab) => void;
  onOtworzGotowosc?: () => void;
}

function backendText(backend: BackendStatus): string {
  switch (backend) {
    case 'connected':
      return SHELL_STRINGS.backendConnected;
    case 'connecting':
      return SHELL_STRINGS.backendConnecting;
    case 'error':
      return SHELL_STRINGS.backendError;
  }
}

function kropkaGotowosci(gotowosc: PodsumowanieGotowosci): string {
  // „Zielona kropka" wyłącznie przy POLICZONEJ gotowości bez uwag — stan
  // nieustalony nie jest stanem dobrym (V12K-309 poz. 1).
  if (!gotowosc.ustalona) return 'mvd-dot mvd-dot-none';
  if (gotowosc.blokady > 0) return 'mvd-dot mvd-dot-err';
  if (gotowosc.ostrzezenia > 0) return 'mvd-dot mvd-dot-warn';
  return 'mvd-dot mvd-dot-ok';
}

export function StatusBar({
  status,
  gotowosc,
  projektOtwarty,
  bieg,
  onReconnect,
  onOpenBottomPanel,
  onOtworzGotowosc,
}: StatusBarProps) {
  const error = status.backend === 'error';
  const wersjaModelu = shortFingerprint(status.wersjaModelu) ?? SHELL_STRINGS.emptyValue;
  const ustalona = projektOtwarty && gotowosc.ustalona;

  return (
    <div className="mvd-statusbar" role="status" aria-live="polite" data-testid="mvd-statusbar">
      <span
        className={error ? 'mvd-status-item mvd-status-static mvd-status-err' : 'mvd-status-item mvd-status-static'}
        data-testid="mvd-status-serwer"
      >
        <span className={error ? 'mvd-dot mvd-dot-err' : 'mvd-dot mvd-dot-ok'} aria-hidden="true" />
        {backendText(status.backend)}
      </span>

      {error && (
        <button type="button" className="mvd-btn" onClick={onReconnect} data-testid="mvd-reconnect">
          {SHELL_STRINGS.reconnect}
        </button>
      )}

      <button
        type="button"
        className="mvd-status-item"
        onClick={() => onOpenBottomPanel?.('dziennik')}
        title={SHELL_STRINGS.revisionHint}
        data-testid="mvd-status-model"
      >
        {modelRevisionLabel(status.modelRevision)}
      </button>

      <button
        type="button"
        className="mvd-status-item"
        onClick={onOtworzGotowosc}
        title={SHELL_STRINGS.readinessHint}
        data-testid="mvd-status-gotowosc"
        data-ustalona={ustalona}
      >
        <span className={kropkaGotowosci({ ...gotowosc, ustalona })} aria-hidden="true" />
        {readinessLabel(gotowosc.ostrzezenia, gotowosc.blokady, ustalona)}
      </button>

      <button
        type="button"
        className={bieg.trwa ? 'mvd-status-item mvd-status-trwa' : 'mvd-status-item'}
        onClick={() => onOpenBottomPanel?.('przebiegi')}
        title={SHELL_STRINGS.runHint}
        aria-busy={bieg.trwa}
        data-testid="mvd-status-run"
        data-trwa={bieg.trwa}
      >
        {bieg.trwa ? (
          <>
            <span className="mvd-wskaznik-biegu" aria-hidden="true" />
            {runInProgressLabel(bieg.analiza, bieg.stan)}
          </>
        ) : (
          runLabel(status.lastRunLabel)
        )}
      </button>

      <span className="mvd-grow" />

      <span className="mvd-status-item mvd-status-static" data-testid="mvd-status-fingerprint">
        {SHELL_STRINGS.wersjaModelu}: <span className="mvd-num">{wersjaModelu}</span>
      </span>
    </div>
  );
}
