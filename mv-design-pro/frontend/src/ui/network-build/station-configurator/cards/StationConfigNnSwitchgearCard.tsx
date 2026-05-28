/**
 * Strona nN — rozdzielnice, poziomy napięć i odbiory.
 *
 * Zawiera:
 *  1. Listę rozdzielnic nN per poziom napięcia.
 *  2. Listę odbiorów nN (zgodnie ze spec sekcja 4 Karta 6 punkt 5
 *     "Odbiory nN") — pełna tabela P/Q/cos φ/kategoria.
 *
 * Odbiory nN są niezbędne do obliczeń rozpływu mocy (Power Flow) oraz
 * spadków napięcia (VDROP). Bez nich solver nie ma podstawowych danych
 * wejściowych. Stąd ta sekcja jest częścią Karty 6 — nie usuwana.
 */

import { StationConfigLoadsCard, type LoadRow } from './StationConfigLoadsCard';

export interface NnSwitchgearRow {
  readonly designation: string;
  readonly nnVoltageKv: number;
  readonly sectionsCount: number;
  readonly feedersCount: number;
  readonly loadsCount: number;
  readonly pvNnCount: number;
  readonly bessNnCount: number;
  readonly pBalanceMw?: number | null;
  readonly qBalanceMvar?: number | null;
  readonly statusPl: 'kompletne' | 'częściowe' | 'brak danych';
}

export interface StationConfigNnSwitchgearCardProps {
  readonly switchgears: readonly NnSwitchgearRow[];
  /**
   * Odbiory nN przypięte do rozdzielnic tej stacji. Wymagane dla Power Flow
   * i VDROP — bez nich obliczenia rozpływu mocy nie mają sensu.
   */
  readonly loads?: readonly LoadRow[];
}

const STATUS_CLASS: Record<NnSwitchgearRow['statusPl'], string> = {
  kompletne: 'text-status-ok',
  'częściowe': 'text-status-warn',
  'brak danych': 'text-status-error',
};

const STATUS_LABEL: Record<NnSwitchgearRow['statusPl'], string> = {
  kompletne: 'kompletne',
  'częściowe': 'do konfiguracji',
  'brak danych': 'do konfiguracji',
};

function formatPowerBalance(value: number | null | undefined, unit: 'MW' | 'Mvar'): string {
  return value === null || value === undefined ? `brak ${unit}` : `${value.toFixed(3)} ${unit}`;
}

export function StationConfigNnSwitchgearCard(
  props: StationConfigNnSwitchgearCardProps,
): JSX.Element {
  const { switchgears, loads = [] } = props;

  return (
    <div data-testid="station-config-nn-switchgear" className="flex flex-col gap-3 text-xs">
      {/* Sekcja 1: rozdzielnice nN */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Rozdzielnice nN ({switchgears.length})
        </div>
        {switchgears.length === 0 ? (
          <div className="italic text-scada-muted">
            Rozdzielnice nN dodaje się z wariantu stacji albo z karty strony nN.
          </div>
        ) : (
          switchgears.map((sw) => (
            <div
              key={sw.designation}
              data-testid={`nn-switchgear-${sw.designation}`}
              className="rounded border border-scada-border bg-scada-bg p-2"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-scada-text">{sw.designation}</span>
                <span className="font-mono text-scada-text">{sw.nnVoltageKv} kV</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                <div><span className="text-scada-muted">Sekcje: </span>{sw.sectionsCount}</div>
                <div><span className="text-scada-muted">Odpływy: </span>{sw.feedersCount}</div>
                <div><span className="text-scada-muted">Odbiory: </span>{sw.loadsCount}</div>
                <div><span className="text-scada-muted">PV po nN: </span>{sw.pvNnCount}</div>
                <div><span className="text-scada-muted">BESS po nN: </span>{sw.bessNnCount}</div>
                <div>
                  <span className="text-scada-muted">Konfiguracja: </span>
                  <span className={STATUS_CLASS[sw.statusPl]}>{STATUS_LABEL[sw.statusPl]}</span>
                </div>
                {sw.pBalanceMw !== null && sw.pBalanceMw !== undefined && (
                  <div className="col-span-2">
                    <span className="text-scada-muted">Bilans P/Q: </span>
                    <span className="font-mono">
                      {formatPowerBalance(sw.pBalanceMw, 'MW')} / {formatPowerBalance(sw.qBalanceMvar, 'Mvar')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sekcja 2: odbiory nN — wymagane dla rozpływu mocy + VDROP */}
      <div
        data-testid="station-config-nn-loads-section"
        className="rounded border border-scada-border bg-scada-surface p-2"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
            Odbiory nN — dane wejściowe rozpływu mocy
          </div>
          <div className="text-[10px] text-scada-muted">
            Wymagane dla Power Flow + VDROP (P/Q per odbiór)
          </div>
        </div>
        <StationConfigLoadsCard loads={loads} />
      </div>
    </div>
  );
}
