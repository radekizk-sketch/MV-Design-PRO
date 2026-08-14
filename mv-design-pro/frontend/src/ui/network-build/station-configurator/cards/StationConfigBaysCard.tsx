/**
 * Karta 4 — Pola SN (lista) (PR-8a, brief 2 §8 karta 4).
 *
 * Naprawa eng.17: bezpieczniki HV z katalogu (HV_FUSE_CATALOG).
 */

import {
  ETYKIETA_BRAK_PASMA_BEZPIECZNIKA_PL,
  HV_FUSE_CATALOG,
  POWOD_BRAK_PASMA_BEZPIECZNIKA_PL,
} from '../../station-der/protection-catalogs';

export type BayTypePl =
  | 'liniowe wejściowe'
  | 'liniowe wyjściowe'
  | 'transformatorowe'
  | 'pomiarowe'
  | 'sprzęgłowe'
  | 'sekcyjne'
  | 'PV/FV'
  | 'BESS'
  | 'FW'
  | 'rezerwowe'
  | 'potrzeb własnych';

export interface StationConfigBayRow {
  readonly bayId: string;
  readonly designation: string;
  readonly bayTypePl: BayTypePl;
  readonly attachedObjectPl?: string;
  readonly hasEquipment: boolean;
  readonly hasProtection: boolean;
  readonly hasMeasurements: boolean;
  readonly statusPl: 'kompletne' | 'częściowe' | 'brak danych';
  /**
   * Naprawa eng.17: catalog_ref do bezpiecznika HV (jeśli pole transformatorowe
   * małej mocy lub feeder z fuse). Null oznacza brak bezpiecznika (wyłącznik).
   */
  readonly hvFuseCatalogRef?: string | null;
}

export interface StationConfigBaysCardProps {
  readonly bays: readonly StationConfigBayRow[];
  readonly onOpenBay?: (bayId: string) => void;
  readonly onShowOnSld?: (bayId: string) => void;
  readonly onCopyConfig?: (bayId: string) => void;
  readonly onDeleteBay?: (bayId: string) => void;
  /** Phase 18: HV fuse onChange (per bay). */
  readonly onChangeHvFuse?: (bayId: string, fuseId: string | null) => void;
}

const STATUS_CLASS: Record<StationConfigBayRow['statusPl'], string> = {
  kompletne: 'text-status-ok',
  'częściowe': 'text-status-warn',
  'brak danych': 'text-status-error',
};

const STATUS_LABEL: Record<StationConfigBayRow['statusPl'], string> = {
  kompletne: 'kompletne',
  'częściowe': 'do konfiguracji',
  'brak danych': 'do konfiguracji',
};

export function StationConfigBaysCard(props: StationConfigBaysCardProps): JSX.Element {
  const { bays, onOpenBay, onShowOnSld, onCopyConfig, onDeleteBay, onChangeHvFuse } = props;

  return (
    <div data-testid="station-config-bays" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Pola SN ({bays.length})
      </div>
      {bays.length === 0 ? (
        <div className="italic text-scada-muted">
          Pola SN dodaje się przez wariant rozdzielnicy albo kartę pola.
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-scada-border text-scada-muted">
              <th className="text-left">Oznaczenie</th>
              <th className="text-left">Typ</th>
              <th className="text-left">Powiązany obiekt</th>
              <th className="text-center">A/Z/P</th>
              <th className="text-left">Status</th>
              <th className="text-left">HV fuse</th>
              <th className="text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {bays.map((b) => (
              <tr
                key={b.bayId}
                data-testid={`station-config-bay-row-${b.bayId}`}
                className="border-b border-scada-border/40"
              >
                <td className="font-mono">{b.designation}</td>
                <td>{b.bayTypePl}</td>
                <td>{b.attachedObjectPl ?? <span className="italic text-scada-muted">—</span>}</td>
                <td className="text-center font-mono text-[10px]">
                  <span className={b.hasEquipment ? 'text-status-ok' : 'text-scada-muted'}>A</span>
                  /
                  <span className={b.hasProtection ? 'text-status-ok' : 'text-scada-muted'}>Z</span>
                  /
                  <span className={b.hasMeasurements ? 'text-status-ok' : 'text-scada-muted'}>P</span>
                </td>
                <td className={STATUS_CLASS[b.statusPl]}>{STATUS_LABEL[b.statusPl]}</td>
                <td data-testid={`bay-fuse-${b.bayId}`} className="text-[10px]">
                  {onChangeHvFuse ? (
                    <select
                      data-testid={`bay-fuse-select-${b.bayId}`}
                      value={b.hvFuseCatalogRef ?? ''}
                      onChange={(e) => onChangeHvFuse(b.bayId, e.target.value || null)}
                      className="rounded border border-scada-border bg-scada-bg px-1 py-0.5 text-[10px]"
                    >
                      <option value="">—</option>
                      {HV_FUSE_CATALOG.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nominal_voltage_kv}kV/{f.nominal_current_a}A · {f.class.replace('_', '-')}
                        </option>
                      ))}
                    </select>
                  ) : b.hvFuseCatalogRef ? (() => {
                    const fuse = HV_FUSE_CATALOG.find((f) => f.id === b.hvFuseCatalogRef);
                    return fuse ? (
                      <span className="flex flex-col" title={fuse.label_pl}>
                        <span className="font-mono text-scada-text">
                          {fuse.nominal_voltage_kv}kV/{fuse.nominal_current_a}A · {fuse.class.replace('_', '-')}
                        </span>
                        {/*
                          Karta K-O: pozycja bez pasma topikowego NIE znika i NIE
                          udaje kompletnej — mówi wprost, czego brakuje. Wzorzec
                          backendowy `BRAK_PASMA_BEZPIECZNIKA` (karta N-D5-FUSE).
                        */}
                        {fuse.pasmo_tcc === null && (
                          <span
                            data-testid={`bay-fuse-brak-pasma-${b.bayId}`}
                            className="text-status-warn"
                            title={POWOD_BRAK_PASMA_BEZPIECZNIKA_PL}
                          >
                            {ETYKIETA_BRAK_PASMA_BEZPIECZNIKA_PL}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-status-error">nieznany</span>
                    );
                  })() : (
                    <span className="text-scada-muted">—</span>
                  )}
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    {onOpenBay && (
                      <button
                        data-testid={`bay-open-${b.bayId}`}
                        onClick={() => onOpenBay(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] hover:bg-scada-active"
                      >
                        otwórz
                      </button>
                    )}
                    {onShowOnSld && (
                      <button
                        data-testid={`bay-show-sld-${b.bayId}`}
                        onClick={() => onShowOnSld(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] hover:bg-scada-active"
                      >
                        SLD
                      </button>
                    )}
                    {onCopyConfig && (
                      <button
                        data-testid={`bay-copy-${b.bayId}`}
                        onClick={() => onCopyConfig(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] hover:bg-scada-active"
                      >
                        kopiuj
                      </button>
                    )}
                    {onDeleteBay && (
                      <button
                        data-testid={`bay-delete-${b.bayId}`}
                        onClick={() => onDeleteBay(b.bayId)}
                        className="rounded border border-scada-border px-1 py-0.5 text-[10px] text-status-error hover:bg-scada-active"
                      >
                        usuń
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
