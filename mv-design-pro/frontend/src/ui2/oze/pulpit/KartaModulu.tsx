/*
 * Karta wybranego modułu (pulpit OZE, karta P47 §2). Sekcje: (1) dane modułu
 * read-only, (2) zgodność NC RfG, (3) praca magazynu (tylko BESS z danymi),
 * (4) zdolność punktu + jakość energii (jawny stan „analiza niewpięta"),
 * (5) dokumenty (callback nawigacji z propsów). Zero fizyki, zero ocen własnych.
 */

import type { NcRfgRunResult } from '../../../ui/ncrfg-tests/api';
import type { StationDerConnection } from '../../../ui/network-build/station-der';
import { formatMoc, formatNapiecie } from '../macierz/strings';
import type { OpisModulu } from '../macierz';
import { SekcjaAdekwatnosciQ } from './SekcjaAdekwatnosciQ';
import { SekcjaMagazynu } from './SekcjaMagazynu';
import { SekcjaSilySieci } from './SekcjaSilySieci';
import { SekcjaZgodnosci } from './SekcjaZgodnosci';
import { daneModulu, zgodnoscModulu } from './pulpitModel';
import { ETYKIETY_STRONY, PULPIT_STRINGS } from './strings';

export interface KartaModuluProps {
  readonly opis: OpisModulu;
  readonly der: StationDerConnection;
  readonly wynik: NcRfgRunResult | null;
  /** Tryb ekspercki odsłania identyfikatory katalogowe. */
  readonly trybEkspercki: boolean;
  /** Nawigacja do dokumentacji modułu (implementacja poza tą kartą). */
  readonly onNawiguj: (cel: 'dokumentacja') => void;
  /** Referencja wyróżnionego modułu (klik w pulpicie) — podświetla wiersze węzła. */
  readonly wyroznionyModul?: string | null;
}

export function KartaModulu({
  opis,
  der,
  wynik,
  trybEkspercki,
  onNawiguj,
  wyroznionyModul = null,
}: KartaModuluProps): JSX.Element {
  const dane = daneModulu(opis, der);
  const zgodnosc = zgodnoscModulu(opis, wynik);

  return (
    <div className="mvd-oze-pulpit-karta" data-testid="mvd-oze-pulpit-karta">
      {/* Sekcja 1 — dane modułu (read-only). */}
      <section
        className="mvd-oze-panel"
        data-testid="mvd-oze-pulpit-dane"
        aria-label={PULPIT_STRINGS.sekcjaDane}
      >
        <h4>{PULPIT_STRINGS.sekcjaDane}</h4>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneRodzaj}</span>
          <span>{dane.rodzaj}</span>
        </div>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneMoc}</span>
          <span className="mvd-oze-num">{formatMoc(dane.mocKw)}</span>
        </div>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneNapiecie}</span>
          <span className="mvd-oze-num">{formatNapiecie(dane.napiecieKv)}</span>
        </div>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneStrona}</span>
          <span>{ETYKIETY_STRONY[dane.stronaPrzylaczenia]}</span>
        </div>
        <div className="mvd-oze-panel-blok" data-testid="mvd-oze-pulpit-odnosniki">
          <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.daneOdnosniki}</span>
          {dane.odnosniki.length === 0 ? (
            <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
              {PULPIT_STRINGS.daneBrakOdnosnikow}
            </p>
          ) : trybEkspercki ? (
            <ul className="mvd-oze-lista">
              {dane.odnosniki.map((o) => (
                <li key={o.wartosc} className="mvd-oze-metryka">
                  <span>{o.etykieta}</span>
                  <span className="mvd-oze-num">{o.wartosc}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mvd-oze-lista">
              {dane.odnosniki.map((o) => (
                <li key={o.etykieta}>{o.etykieta}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Sekcja 2 — zgodność NC RfG. */}
      <SekcjaZgodnosci zgodnosc={zgodnosc} />

      {/* Sekcja 3 — praca magazynu (BESS z katalogu konwerterów). */}
      <SekcjaMagazynu der={der} trybEkspercki={trybEkspercki} />

      {/* Sekcja 4a — zdolność punktu przyłączenia (siła sieci, SCR/WSCR). */}
      <SekcjaSilySieci trybEkspercki={trybEkspercki} wyroznionyModul={wyroznionyModul} />

      {/* Sekcja 4b — adekwatność mocy biernej. */}
      <SekcjaAdekwatnosciQ trybEkspercki={trybEkspercki} wyroznionyModul={wyroznionyModul} />

      {/* Sekcja 5 — dokumenty. */}
      <section
        className="mvd-oze-panel"
        data-testid="mvd-oze-pulpit-dokumenty"
        aria-label={PULPIT_STRINGS.sekcjaDokumenty}
      >
        <h4>{PULPIT_STRINGS.sekcjaDokumenty}</h4>
        <p style={{ margin: 0 }}>{PULPIT_STRINGS.dokumentyOpis}</p>
        <button
          type="button"
          className="mvd-btn"
          onClick={() => onNawiguj('dokumentacja')}
          data-testid="mvd-oze-pulpit-dokumenty-przejdz"
        >
          {PULPIT_STRINGS.dokumentyPrzejdz}
        </button>
      </section>
    </div>
  );
}
