/*
 * Pasek stanu (rola ARIA status). Wskaźnik połączenia z serwerem (czerwony +
 * „Połącz ponownie" przy błędzie), rewizja modelu, etykieta ostatniego
 * przebiegu oraz WERSJA MODELU — skrócony odcisk SHA-256 migawki (strefa
 * techniczna, K6/H-6 R4: chip pokazuje realny `hash_sha256` migawki, bo
 * dawne źródło odcisku nie miało żywego dostawcy). Klik pozycji → żądanie
 * otwarcia panelu dolnego (obsługa w E1.4) — karta §4a.
 */

import type { ShellStatusInfo, BackendStatus } from './shellStatus';
import { shortFingerprint } from './shellStatus';
import type { BottomPanelTab } from './useShellStore';
import { SHELL_STRINGS, modelRevisionLabel, runLabel } from './strings';

interface StatusBarProps {
  status: ShellStatusInfo;
  onReconnect?: () => void;
  onOpenBottomPanel?: (tab: BottomPanelTab) => void;
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

export function StatusBar({ status, onReconnect, onOpenBottomPanel }: StatusBarProps) {
  const error = status.backend === 'error';
  const wersjaModelu = shortFingerprint(status.wersjaModelu) ?? SHELL_STRINGS.emptyValue;

  return (
    <div className="mvd-statusbar" role="status" aria-live="polite" data-testid="mvd-statusbar">
      <span className={error ? 'mvd-status-item mvd-status-static mvd-status-err' : 'mvd-status-item mvd-status-static mvd-status-ok'}>
        <span className={error ? 'mvd-dot mvd-dot-err' : 'mvd-dot mvd-dot-ok'} />
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
        onClick={() => onOpenBottomPanel?.('problemy')}
        data-testid="mvd-status-model"
      >
        {modelRevisionLabel(status.modelRevision)}
      </button>

      <button
        type="button"
        className="mvd-status-item"
        onClick={() => onOpenBottomPanel?.('przebiegi')}
        data-testid="mvd-status-run"
      >
        {runLabel(status.lastRunLabel)}
      </button>

      <span className="mvd-grow" />

      <span className="mvd-status-item mvd-status-static" data-testid="mvd-status-fingerprint">
        {SHELL_STRINGS.wersjaModelu}: <span className="mvd-num">{wersjaModelu}</span>
      </span>
    </div>
  );
}
