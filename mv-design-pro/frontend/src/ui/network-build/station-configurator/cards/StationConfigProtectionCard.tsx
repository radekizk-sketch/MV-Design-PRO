/**
 * Karta 8 — Zabezpieczenia i automatyka (PR-8a, brief §8 karta 8).
 *
 * Naprawa eng.20: walidacja VT voltage_factor vs typ uziemienia neutralnego.
 * Naprawa eng.18: walidacja Idyn/Ith aparatury (IEC 60909).
 */

import { useEffect, useState } from 'react';

import { fetchVtTypes } from '../../../catalog/api';
import type { VTCatalogType } from '../../../catalog/types';
import { validateDeviceWithstand } from '../../station-der/protection-catalogs';
import { WalidacjaVtPolaSekcja } from './WalidacjaVtPolaSekcja';

export interface ProtectionRow {
  readonly relayId: string;
  readonly bayDesignation: string;
  readonly typePl: string;
  readonly functionsPl: readonly string[];  // np. ["50/51", "51N", "67"]
  readonly settingsCount: number;
  readonly selectivityStatus: 'kompletna' | 'częściowa' | 'błędna' | 'brak danych';
  /** Naprawa eng.20: catalog_ref VT używanego dla pól zabezpieczeniowych. */
  readonly vtCatalogRef?: string | null;
}

export interface AutomationFlag {
  readonly id: string;
  readonly labelPl: string;
  readonly enabled: boolean;
}

/** Naprawa eng.18: dane wytrzymałości aparatury w polu (z katalogu device_withstand). */
export interface DeviceWithstandRow {
  readonly bayDesignation: string;
  readonly deviceCatalogRef: string;
  readonly i_peak_calculated_ka: number;
  readonly i_thermal_calculated_ka: number;
  readonly t_clearing_s: number;
}

export interface StationConfigProtectionCardProps {
  readonly relays: readonly ProtectionRow[];
  readonly automation: readonly AutomationFlag[];
  readonly interlocksConfigured: boolean;
  readonly controlMode?: 'lokalne' | 'zdalne' | 'lokalne_zablokowane' | 'odstawione';
  /** Naprawa eng.20: typ uziemienia neutralnego SN — wymagane do walidacji VT. */
  readonly mvNeutralGroundingType?: 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded';
  /** Naprawa eng.18: lista aparatów do walidacji wytrzymałości. */
  readonly deviceWithstandRows?: readonly DeviceWithstandRow[];
  /** Phase 18: VT onChange (per bay). */
  readonly onChangeVt?: (bayDesignation: string, vtId: string | null) => void;
}

const SELECTIVITY_CLASS: Record<ProtectionRow['selectivityStatus'], string> = {
  kompletna: 'text-status-ok',
  'częściowa': 'text-status-warn',
  błędna: 'text-status-error',
  'brak danych': 'text-scada-muted',
};

const SELECTIVITY_LABEL: Record<ProtectionRow['selectivityStatus'], string> = {
  kompletna: 'kompletna',
  'częściowa': 'do konfiguracji',
  błędna: 'do weryfikacji',
  'brak danych': 'do konfiguracji',
};

export function StationConfigProtectionCard(
  props: StationConfigProtectionCardProps,
): JSX.Element {
  const {
    relays,
    automation,
    interlocksConfigured,
    controlMode,
    mvNeutralGroundingType,
    deviceWithstandRows,
    onChangeVt,
  } = props;

  // WYBOR Z KATALOGU BACKENDU, NIE Z LOKALNEJ LISTY (V12K-257). Poprzednia wersja
  // oferowala cztery typy zapisane w pliku frontu; ich identyfikatory nie istnialy
  // w katalogu backendu, wiec zapisany wybor byl referencja donikad — dobor
  // przekladnika (V12K-255) widzial „typ nieznany katalogowi".
  const [typyVt, setTypyVt] = useState<readonly VTCatalogType[] | null>(null);
  useEffect(() => {
    if (!onChangeVt) return;
    let aktualne = true;
    void fetchVtTypes()
      .then((typy) => {
        if (aktualne) setTypyVt(typy);
      })
      .catch(() => {
        if (aktualne) setTypyVt([]);
      });
    return () => {
      aktualne = false;
    };
  }, [onChangeVt]);

  // Naprawa eng.18: walidacja wytrzymałości aparatury.
  const withstandValidations = (deviceWithstandRows ?? []).map((row) => ({
    bayDesignation: row.bayDesignation,
    ...validateDeviceWithstand({
      device_id: row.deviceCatalogRef,
      i_peak_calculated_ka: row.i_peak_calculated_ka,
      i_thermal_calculated_ka: row.i_thermal_calculated_ka,
      t_clearing_s: row.t_clearing_s,
    }),
  }));

  return (
    <div data-testid="station-config-protection" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Zabezpieczenia i automatyka
      </div>

      <div data-testid="protection-relays-list">
        <div className="text-[10px] font-medium text-scada-muted">Przekaźniki ({relays.length})</div>
        {relays.length === 0 ? (
          <div className="italic text-scada-muted">
            Zabezpieczenia dodaje się z wariantu pola SN albo pakietu zabezpieczeniowego.
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-scada-muted">
                <th className="text-left">Pole</th>
                <th className="text-left">Typ</th>
                <th className="text-left">Funkcje</th>
                <th className="text-right">Nastawy</th>
                <th className="text-left">Selektywność</th>
                <th className="text-left">Przekł. napięciowy pola</th>
              </tr>
            </thead>
            <tbody>
              {relays.map((r) => (
                <tr key={r.relayId} data-testid={`relay-row-${r.relayId}`} className="border-b border-scada-border/40">
                  <td className="font-mono">{r.bayDesignation}</td>
                  <td>{r.typePl}</td>
                  <td className="font-mono text-[10px]">{r.functionsPl.join(', ')}</td>
                  <td className="text-right font-mono">{r.settingsCount}</td>
                  <td className={SELECTIVITY_CLASS[r.selectivityStatus]}>
                    {SELECTIVITY_LABEL[r.selectivityStatus]}
                  </td>
                  <td>
                    {/* Phase 18: VT select per row gdy onChangeVt dostarczony. */}
                    {onChangeVt ? (
                      <select
                        data-testid={`relay-vt-select-${r.relayId}`}
                        value={r.vtCatalogRef ?? ''}
                        onChange={(e) => onChangeVt(r.bayDesignation, e.target.value || null)}
                        className="rounded border border-scada-border bg-scada-bg px-1 py-0.5 text-[10px]"
                      >
                        <option value="">—</option>
                        {(typyVt ?? []).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[10px] text-scada-muted">
                        {r.vtCatalogRef ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div data-testid="protection-automation">
        <div className="text-[10px] font-medium text-scada-muted">Automatyka</div>
        <div className="grid grid-cols-2 gap-1">
          {automation.map((a) => (
            <div
              key={a.id}
              data-testid={`automation-${a.id}`}
              className={`rounded border border-scada-border px-2 py-1 ${a.enabled ? 'text-status-ok' : 'text-scada-muted'}`}
            >
              {a.enabled ? '✓' : '○'} {a.labelPl}
            </div>
          ))}
        </div>
      </div>

      <WalidacjaVtPolaSekcja
        pola={relays.map((r) => ({
          bayDesignation: r.bayDesignation,
          vtCatalogRef: r.vtCatalogRef ?? null,
        }))}
        typUziemienia={mvNeutralGroundingType}
      />

      {withstandValidations.length > 0 && (
        <div data-testid="device-withstand-validation" className="space-y-1">
          <div className="text-[10px] font-medium text-scada-muted">
            Walidacja wytrzymałości aparatury I_dyn / I_th (IEC 60909)
          </div>
          <div className="grid grid-cols-1 gap-1">
            {withstandValidations.map((row) => (
              <div
                key={row.bayDesignation}
                data-testid={`withstand-${row.bayDesignation}`}
                data-withstand-ok={String(row.ok)}
                className={
                  'rounded border px-2 py-1 text-[11px] '
                  + (row.ok
                    ? 'border-emerald-700 bg-emerald-950/20 text-emerald-200'
                    : 'border-rose-700 bg-rose-950/20 text-rose-200')
                }
              >
                <span className="font-mono">{row.bayDesignation}</span>: {row.message_pl}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between border-t border-scada-border pt-1.5 text-[11px]">
        <div>
          <span className="text-scada-muted">Uzależnienia łączeniowe: </span>
          <span className={interlocksConfigured ? 'text-status-ok' : 'text-status-warn'}>
            {interlocksConfigured ? 'skonfigurowane' : 'do konfiguracji'}
          </span>
        </div>
        <div>
          <span className="text-scada-muted">Sterowanie: </span>
          <span className="text-scada-text">{controlMode ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
