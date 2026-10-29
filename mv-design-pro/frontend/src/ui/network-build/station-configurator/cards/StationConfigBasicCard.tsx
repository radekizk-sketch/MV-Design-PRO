/**
 * Karta 1 — Dane podstawowe (PR-8a, brief 2 §8 karta 1).
 *
 * FAKTY MODELU, NIE DRUGI EDYTOR (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA). Karta pokazuje
 * nazwę, oznaczenie, rodzaj, typ konstrukcyjny i napięcia stacji z modelu sieci; zmiana
 * danych stacji idzie JEDNĄ drogą produktu — formularzem operacji
 * `update_element_parameters` (ta sama, którą otwiera karta stacji w drzewie).
 *
 * Usunięte na amen:
 *  - wybór „uziemienia neutralnego SN z katalogu audytu 2” — był drugą prawdą obok modelu:
 *    sposób uziemienia punktu neutralnego sieci SN niesie zespół uziemiający sekcji
 *    (`enm.uziemienie_sekcji`), a zgodność przekładników czyta go z backendu
 *    (`WalidacjaVtPolaSekcja`);
 *  - pola edycyjne nazwy, oznaczenia, typu konstrukcyjnego, operatora i lokalizacji —
 *    konfigurator nigdy nie zapisywał ich zmian (kontrolki-widma); operatora i lokalizacji
 *    model stacji nie ma wcale;
 *  - domyślny typ konstrukcyjny „kontenerowa” — brak w modelu to „nie podano”, nie domysł.
 */

import type { CompletenessStatus } from '../../../inspector/v2/InspectorStickyHeader';
import { atrybutRoliAkcji, klasaAkcji } from '../../../shared/akcjeStanow';

export type StationTopologicalType = 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
export type StationConstructionType = 'wnetrzowa' | 'kontenerowa' | 'slupowa' | 'prefabrykowana' | 'inna';

export interface StationConfigBasicCardProps {
  readonly stationName: string;
  /** Oznaczenie stacji na dokumentacji z modelu (`Substation.designation`). */
  readonly designation?: string | null;
  /** Rodzaj stacji z jednej reguły produktu (`ui/shared/rodzajStacji.ts`); `null` — stacji nie
   *  ma w migawce modelu (rodzaj nieustalony, bez domysłu). */
  readonly topologicalType: StationTopologicalType | null;
  /** Przyczyna rodzaju w słowach projektanta (liczba pól liniowych, sprzęgło). */
  readonly topologicalReasonPl?: string | null;
  /** Typ konstrukcyjny z modelu (`Substation.construction_type`); brak = „nie podano”. */
  readonly constructionType?: StationConstructionType | null;
  /** Napięcie szyny SN stacji z modelu; `null` — model go nie podaje (bez domysłu). */
  readonly snVoltageKv: number | null;
  readonly nnVoltageLevels: readonly number[];
  readonly completeness: CompletenessStatus;
  /** Otwiera formularz operacji zmiany danych stacji w modelu; brak = stacji nie ma w modelu. */
  readonly onEditStation?: () => void;
}

const CONSTRUCTION_LABEL_PL: Record<StationConstructionType, string> = {
  wnetrzowa: 'wnętrzowa',
  kontenerowa: 'kontenerowa',
  slupowa: 'słupowa',
  prefabrykowana: 'prefabrykowana',
  inna: 'inna',
};

export function StationConfigBasicCard(props: StationConfigBasicCardProps): JSX.Element {
  const {
    stationName, designation, topologicalType, topologicalReasonPl, constructionType,
    snVoltageKv, nnVoltageLevels, onEditStation,
  } = props;

  return (
    <div data-testid="station-config-basic" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Dane podstawowe
      </div>
      <div className="flex flex-col gap-1.5">
        <div>
          <span className="text-scada-muted">Nazwa stacji: </span>
          <span data-testid="station-name" className="text-scada-text">{stationName}</span>
        </div>
        <div>
          <span className="text-scada-muted">Oznaczenie: </span>
          <span data-testid="station-designation" className="text-scada-text">
            {designation ?? 'nie podano w modelu'}
          </span>
        </div>
        <div>
          <span className="text-scada-muted">Rodzaj stacji: </span>
          <span data-testid="station-topological-type" className="text-scada-text">
            {topologicalType ?? 'nieustalony — stacji brak w modelu'}
          </span>
          {topologicalReasonPl ? (
            <span data-testid="station-topological-reason" className="ml-2 text-[10px] text-scada-muted">
              ({topologicalReasonPl})
            </span>
          ) : null}
        </div>
        <div>
          <span className="text-scada-muted">Typ konstrukcyjny: </span>
          <span data-testid="station-construction-type" className="text-scada-text">
            {constructionType ? CONSTRUCTION_LABEL_PL[constructionType] : 'nie podano w modelu'}
          </span>
        </div>
        <div>
          <span className="text-scada-muted">Napięcie SN: </span>
          <span data-testid="station-sn-voltage" className="font-mono text-scada-text">{snVoltageKv !== null ? `${snVoltageKv} kV` : 'brak danych'}</span>
        </div>
        <div>
          <span className="text-scada-muted">Poziomy nN: </span>
          {nnVoltageLevels.length > 0 ? (
            <span data-testid="station-nn-voltages" className="font-mono text-scada-text">
              {nnVoltageLevels.join(' / ')} kV
            </span>
          ) : (
            <span className="italic text-scada-muted">—</span>
          )}
          {nnVoltageLevels.length > 1 && (
            <span className="ml-2 text-[10px] text-status-ok">
              ● multi-voltage (briefa §13)
            </span>
          )}
        </div>
        {onEditStation && (
          <button
            type="button"
            data-testid="station-edit-data"
            onClick={onEditStation}
            {...atrybutRoliAkcji('drugorzedna')}
            className={`self-start ${klasaAkcji('drugorzedna')}`}
          >
            Zmień dane stacji w modelu
          </button>
        )}
      </div>
    </div>
  );
}
