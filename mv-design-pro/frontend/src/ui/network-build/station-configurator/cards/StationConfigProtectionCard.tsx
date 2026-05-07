/**
 * Karta 8 — Zabezpieczenia i automatyka (PR-8a, brief §8 karta 8).
 *
 * Naprawa eng.20: walidacja VT voltage_factor vs typ uziemienia neutralnego.
 * Naprawa eng.18: walidacja Idyn/Ith aparatury (IEC 60909).
 */

import {
  VT_CATALOG,
  isVtVoltageFactorValidForGrounding,
  validateDeviceWithstand,
} from '../../station-der/protection-catalogs';

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

  // Naprawa eng.20: walidacja VT vs typ uziemienia.
  const vtValidationRows = mvNeutralGroundingType
    ? relays
        .filter((r) => r.vtCatalogRef)
        .map((r) => {
          const vt = VT_CATALOG.find((v) => v.id === r.vtCatalogRef);
          if (!vt) return null;
          const validation = isVtVoltageFactorValidForGrounding(
            vt.voltage_factor,
            mvNeutralGroundingType,
          );
          return {
            bayDesignation: r.bayDesignation,
            vtLabel: vt.label_pl,
            voltageFactor: vt.voltage_factor,
            ok: validation.ok,
            message_pl: validation.message_pl,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

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
          <div className="italic text-scada-muted">Brak zabezpieczeń.</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-scada-muted">
                <th className="text-left">Pole</th>
                <th className="text-left">Typ</th>
                <th className="text-left">Funkcje</th>
                <th className="text-right">Nastawy</th>
                <th className="text-left">Selektywność</th>
                <th className="text-left">Przekładnik napięciowy</th>
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
                    {r.selectivityStatus}
                  </td>
                  <td>
                    {/* Wybór przekładnika napięciowego dla pola, gdy formularz przekazuje handler zmiany. */}
                    {onChangeVt ? (
                      <select
                        data-testid={`relay-vt-select-${r.relayId}`}
                        value={r.vtCatalogRef ?? ''}
                        onChange={(e) => onChangeVt(r.bayDesignation, e.target.value || null)}
                        className="rounded border border-scada-border bg-scada-bg px-1 py-0.5 text-[10px]"
                      >
                        <option value="">—</option>
                        {VT_CATALOG.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label_pl}
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

      {vtValidationRows.length > 0 && (
        <div data-testid="vt-grounding-validation" className="space-y-1">
          <div className="text-[10px] font-medium text-scada-muted">
            Walidacja VT vs typ uziemienia neutralnego (IEC 61869-3)
          </div>
          <div className="grid grid-cols-1 gap-1">
            {vtValidationRows.map((row) => (
              <div
                key={row.bayDesignation}
                data-testid={`vt-validation-${row.bayDesignation}`}
                data-vt-ok={String(row.ok)}
                className={
                  'rounded border px-2 py-1 text-[11px] '
                  + (row.ok
                    ? 'border-emerald-700 bg-emerald-950/20 text-emerald-200'
                    : 'border-rose-700 bg-rose-950/20 text-rose-200')
                }
              >
                <span className="font-mono">{row.bayDesignation}</span>: VT U_th={row.voltageFactor}
                {row.ok ? ' · OK' : ' · ' + row.message_pl}
              </div>
            ))}
          </div>
        </div>
      )}

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
          <span className="text-scada-muted">Blokady łączeniowe: </span>
          <span className={interlocksConfigured ? 'text-status-ok' : 'text-status-warn'}>
            {interlocksConfigured ? 'skonfigurowane' : 'brak'}
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
