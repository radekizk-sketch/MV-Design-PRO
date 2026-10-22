/**
 * Strona nN — rozdzielnice (sekcje) nN i odbiory domeny nN stacji.
 *
 * Dane z atomowej projekcji domeny nN backendu (`stronaNnStacji.ts`): sekcje rozdzielnic,
 * zasilania, sprzęgła i odpływy z rodzajem rozstrzygniętym przez backend z zawartości
 * poddrzewa. Stan pobrania (brak przypadku, ładowanie, błąd, brak domeny) jest pokazywany
 * wprost — pusta lista nie udaje rozdzielnicy bez odpływów.
 */

import { StationConfigLoadsCard, type LoadRow } from './StationConfigLoadsCard';
import type { StanDanychNn } from '../stronaNnStacji';

export interface NnSwitchgearRow {
  readonly sectionId: string;
  readonly designation: string;
  readonly nnVoltageKv: number | null;
  /** `main` — sekcja rozdzielnicy głównej stacji, `sub` — podrozdzielnica wchłonięta w domenę. */
  readonly tier: 'main' | 'sub';
  readonly incomersCount: number;
  readonly couplersCount: number;
  readonly feedersCount: number;
  /** Odpływy z odbiorami w poddrzewie (rodzaj `load` albo `mixed` backendu). */
  readonly loadFeedersCount: number;
  /** Odpływy ze źródłami w poddrzewie (rodzaj `der` albo `mixed` backendu). */
  readonly derFeedersCount: number;
  readonly subBoardFeedersCount: number;
}

export interface StationConfigNnSwitchgearCardProps {
  readonly switchgears: readonly NnSwitchgearRow[];
  readonly loads: readonly LoadRow[];
  readonly stanDanych: StanDanychNn;
}

const RODZAJ_SEKCJI_PL: Record<NnSwitchgearRow['tier'], string> = {
  main: 'rozdzielnica główna',
  sub: 'podrozdzielnica',
};

function komunikatStanu(stan: StanDanychNn): string | null {
  switch (stan.stan) {
    case 'brak_przypadku':
      return 'Brak aktywnego przypadku obliczeniowego — domena nN jest odczytywana z modelu przypadku.';
    case 'ladowanie':
      return 'Wczytywanie domeny nN stacji…';
    case 'blad':
    case 'brak_domeny':
      return stan.komunikatPl;
    case 'gotowe':
      return null;
  }
}

export function StationConfigNnSwitchgearCard(
  props: StationConfigNnSwitchgearCardProps,
): JSX.Element {
  const { switchgears, loads, stanDanych } = props;
  const komunikat = komunikatStanu(stanDanych);

  return (
    <div
      data-testid="station-config-nn-switchgear"
      data-stan={stanDanych.stan}
      className="flex flex-col gap-3 text-xs"
    >
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Rozdzielnice nN ({switchgears.length})
        </div>
        {komunikat !== null ? (
          <div data-testid="nn-switchgear-stan" className="italic text-scada-muted">{komunikat}</div>
        ) : switchgears.length === 0 ? (
          <div className="italic text-scada-muted">
            Stacja nie ma szyn nN — rozdzielnicę nN tworzy transformator stacji albo kreator stacji.
          </div>
        ) : (
          switchgears.map((sw) => (
            <div
              key={sw.sectionId}
              data-testid={`nn-switchgear-${sw.sectionId}`}
              className="rounded border border-scada-border bg-scada-bg p-2"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-scada-text">{sw.designation}</span>
                <span className="font-mono text-scada-text">
                  {sw.nnVoltageKv !== null ? `${sw.nnVoltageKv} kV` : 'napięcie nieustalone'}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                <div><span className="text-scada-muted">Rodzaj: </span>{RODZAJ_SEKCJI_PL[sw.tier]}</div>
                <div><span className="text-scada-muted">Zasilania: </span>{sw.incomersCount}</div>
                <div><span className="text-scada-muted">Sprzęgła: </span>{sw.couplersCount}</div>
                <div><span className="text-scada-muted">Odpływy: </span>{sw.feedersCount}</div>
                <div><span className="text-scada-muted">z odbiorami: </span>{sw.loadFeedersCount}</div>
                <div><span className="text-scada-muted">ze źródłami: </span>{sw.derFeedersCount}</div>
                <div><span className="text-scada-muted">do podrozdzielnic: </span>{sw.subBoardFeedersCount}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        data-testid="station-config-nn-loads-section"
        className="rounded border border-scada-border bg-scada-surface p-2"
      >
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Odbiory nN — dane wejściowe rozpływu mocy
        </div>
        <StationConfigLoadsCard loads={loads} komunikatBrakuPl={komunikat ?? undefined} />
      </div>
    </div>
  );
}
