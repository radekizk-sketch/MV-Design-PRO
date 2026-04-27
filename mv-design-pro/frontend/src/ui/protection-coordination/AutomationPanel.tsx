/**
 * AutomationPanel — UI dla automatyki sieciowej (Pakiet G).
 *
 * 4 sekcje:
 *   - SPZ (cykle 1×, 2×, 3×, dead time, blokady)
 *   - SZR (priorytet rezerwy, opóźnienie, sync check)
 *   - SCO (stopnie z malejącymi progami częstotliwości)
 *   - FDIR (strefy + sekwencja detection → isolation → restoration)
 *
 * White box: render za feature-flagiem WorkMode === 'TZ' (D7).
 *   W innych trybach panel działa READ-ONLY (showReadOnly).
 */

import { useState } from 'react';
import { clsx } from 'clsx';

import {
  AUTOMATION_LABELS_PL,
  validateAutomation,
} from './automationTypes';
import type {
  AutomationConfig,
  AutomationKind,
  FdirConfig,
  ScoConfig,
  SpzConfig,
  SzrConfig,
} from './automationTypes';

export interface AutomationPanelProps {
  configs: ReadonlyArray<AutomationConfig>;
  /** True → editor; false → read-only audytor */
  editable: boolean;
  /** Wywołane gdy użytkownik akceptuje zmianę */
  onUpdate?: (next: AutomationConfig) => void;
}

type Tab = AutomationKind;

const TABS: ReadonlyArray<Tab> = Object.freeze(['SPZ', 'SZR', 'SCO', 'FDIR']);

function SpzView({ cfg }: { cfg: SpzConfig }) {
  return (
    <div data-testid={`spz-view-${cfg.device_id}`} className="flex flex-col gap-2 text-xs">
      <div className="flex justify-between">
        <span className="font-semibold">{cfg.device_id}</span>
        <span className={clsx(cfg.enabled ? 'text-scada-sn' : 'text-scada-muted')}>
          {cfg.enabled ? 'Aktywne' : 'Wyłączone'}
        </span>
      </div>
      <table className="w-full" data-testid={`spz-cycles-${cfg.device_id}`}>
        <thead>
          <tr className="text-scada-muted">
            <th className="text-left">Cykl</th>
            <th className="text-left">Dead time [s]</th>
            <th className="text-left">Reclaim [s]</th>
          </tr>
        </thead>
        <tbody>
          {cfg.cycles.map((c) => (
            <tr key={c.cycle_no} data-testid={`spz-cycle-${cfg.device_id}-${c.cycle_no}`}>
              <td>{c.cycle_no}×</td>
              <td>{c.dead_time_s.toFixed(2)}</td>
              <td>{c.reclaim_time_s.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cfg.blocking_protections && cfg.blocking_protections.length > 0 && (
        <p className="text-scada-muted">
          Blokady: {cfg.blocking_protections.join(', ')}
        </p>
      )}
    </div>
  );
}

function SzrView({ cfg }: { cfg: SzrConfig }) {
  return (
    <div data-testid={`szr-view-${cfg.device_id}`} className="flex flex-col gap-1 text-xs">
      <div className="flex justify-between">
        <span className="font-semibold">{cfg.device_id}</span>
        <span className={clsx(cfg.enabled ? 'text-scada-sn' : 'text-scada-muted')}>
          {cfg.enabled ? 'Aktywne' : 'Wyłączone'}
        </span>
      </div>
      <p>
        Priorytet rezerwy: <span data-testid={`szr-priority-${cfg.device_id}`}>{cfg.backup_priority}</span>
      </p>
      <p>Opóźnienie: {cfg.delay_s.toFixed(2)} s</p>
      <p>
        Kontrola synchronizmu:{' '}
        <span data-testid={`szr-sync-${cfg.device_id}`}>
          {cfg.sync_check_required ? 'TAK' : 'NIE'}
        </span>
      </p>
    </div>
  );
}

function ScoView({ cfg }: { cfg: ScoConfig }) {
  return (
    <div data-testid={`sco-view-${cfg.device_id}`} className="flex flex-col gap-1 text-xs">
      <div className="flex justify-between">
        <span className="font-semibold">{cfg.device_id}</span>
        <span className={clsx(cfg.enabled ? 'text-scada-sn' : 'text-scada-muted')}>
          {cfg.enabled ? 'Aktywne' : 'Wyłączone'}
        </span>
      </div>
      <table className="w-full" data-testid={`sco-stages-${cfg.device_id}`}>
        <thead>
          <tr className="text-scada-muted">
            <th className="text-left">Stopień</th>
            <th className="text-left">Próg [Hz]</th>
            <th className="text-left">Odciążenie [%]</th>
            <th className="text-left">Δt [s]</th>
          </tr>
        </thead>
        <tbody>
          {cfg.stages.map((s) => (
            <tr key={s.stage_no} data-testid={`sco-stage-${cfg.device_id}-${s.stage_no}`}>
              <td>{s.stage_no}</td>
              <td>{s.freq_threshold_hz.toFixed(2)}</td>
              <td>{s.shed_percent.toFixed(1)}</td>
              <td>{s.delay_s.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FdirView({ cfg }: { cfg: FdirConfig }) {
  const PHASE_LABELS_PL: Record<string, string> = {
    detection: 'Detekcja',
    isolation: 'Izolacja',
    restoration: 'Przywracanie',
  };
  return (
    <div data-testid={`fdir-view-${cfg.device_id}`} className="flex flex-col gap-1 text-xs">
      <div className="flex justify-between">
        <span className="font-semibold">{cfg.device_id}</span>
        <span className={clsx(cfg.enabled ? 'text-scada-sn' : 'text-scada-muted')}>
          {cfg.enabled ? 'Aktywne' : 'Wyłączone'}
        </span>
      </div>
      <p>
        Strefy detekcji: <span data-testid={`fdir-zones-${cfg.device_id}`}>{cfg.detection_zones.join(', ')}</span>
      </p>
      <ol className="list-decimal pl-5" data-testid={`fdir-sequence-${cfg.device_id}`}>
        {cfg.sequence.map((s) => (
          <li key={s.step_no} data-testid={`fdir-step-${cfg.device_id}-${s.step_no}`}>
            <strong>[{PHASE_LABELS_PL[s.phase]}]</strong> {s.action_description_pl}
            {' '}
            <span className="text-scada-muted">(max {s.max_duration_s.toFixed(1)} s)</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AutomationPanel({ configs, editable, onUpdate: _onUpdate }: AutomationPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('SPZ');

  // Filter configs by active tab — sortuj po device_id ASC dla determinizmu
  const filtered = configs
    .filter((c) => c.kind === activeTab)
    .slice()
    .sort((a, b) => a.device_id.localeCompare(b.device_id));

  // Walidacja wszystkich configów (zbiorczy stan dla nagłówka)
  const totalErrors = configs
    .map((c) => validateAutomation(c))
    .filter((e): e is string => e !== null).length;

  return (
    <div
      data-testid="automation-panel"
      data-editable={editable}
      className="flex flex-col gap-3 p-3 bg-scada-surface text-scada-text border border-scada-border"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Automatyka sieciowa</h3>
        {!editable && (
          <span className="text-xs text-scada-muted" data-testid="automation-readonly-badge">
            Tylko podgląd (przełącz na tryb TZ aby edytować)
          </span>
        )}
        {totalErrors > 0 && (
          <span className="text-xs text-red-400" data-testid="automation-errors-count">
            {totalErrors} błędów konfiguracji
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-scada-border" data-testid="automation-tabs">
        {TABS.map((tab) => {
          const count = configs.filter((c) => c.kind === tab).length;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'text-xs px-3 py-1 border-b-2',
                activeTab === tab
                  ? 'border-scada-active text-scada-sn'
                  : 'border-transparent text-scada-muted hover:text-scada-text',
              )}
              data-testid={`automation-tab-${tab}`}
            >
              {tab} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3" data-testid={`automation-content-${activeTab}`}>
        {filtered.length === 0 ? (
          <p className="text-xs text-scada-muted" data-testid="automation-empty">
            Brak konfiguracji {AUTOMATION_LABELS_PL[activeTab]}.
          </p>
        ) : (
          filtered.map((cfg) => (
            <div
              key={`${cfg.kind}-${cfg.device_id}`}
              className="border border-scada-border p-2 rounded"
            >
              {cfg.kind === 'SPZ' && <SpzView cfg={cfg} />}
              {cfg.kind === 'SZR' && <SzrView cfg={cfg} />}
              {cfg.kind === 'SCO' && <ScoView cfg={cfg} />}
              {cfg.kind === 'FDIR' && <FdirView cfg={cfg} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
