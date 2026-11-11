/*
 * Karta wybranego modułu (pulpit OZE, karta P47 §2). Sekcje: (1) dane modułu
 * read-only, (2) zgodność NC RfG (wynik modułu i rekordy wymagań z oceny zatwierdzonego
 * modelu — kontrakt V2),
 * (3) praca magazynu (tylko BESS z danymi), (4) zdolność punktu + adekwatność mocy
 * biernej, (5) dokumenty (callback nawigacji z propsów). Zero fizyki, zero ocen własnych.
 */

import type { StationDerConnection } from '../../../ui/network-build/station-der';
import { formatMoc, formatNapiecie } from '../macierz/strings';
import type { OpisModuluModelu } from '../macierz';
import { InformacjeAudytowe } from '../../wyniki/wzorzec';
import { SekcjaAdekwatnosciQ } from './SekcjaAdekwatnosciQ';
import { SekcjaMagazynu } from './SekcjaMagazynu';
import { SekcjaSilySieci } from './SekcjaSilySieci';
import { SekcjaZgodnosci } from './SekcjaZgodnosci';
import { daneModulu, type PozycjaModulu, type StanOcenyModelu } from './pulpitModel';
import { ETYKIETY_STRONY, PULPIT_STRINGS } from './strings';

export interface KartaModuluProps {
  readonly opis: OpisModuluModelu;
  readonly der: StationDerConnection;
  /** Pozycja modułu (wynik modułu i rekordy wymagań z oceny zatwierdzonego modelu). */
  readonly pozycja: PozycjaModulu;
  /** Stan odczytu oceny modelu (stan zerowy sekcji zgodności). */
  readonly stanOceny: StanOcenyModelu;
  /** Tryb ekspercki odsłania identyfikatory katalogowe. */
  readonly szczegolyAudytowe: boolean;
  /** Nawigacja do dokumentacji modułu (implementacja poza tą kartą). */
  readonly onNawiguj: (cel: 'dokumentacja') => void;
  /** Referencja wyróżnionego modułu (klik w pulpicie) — podświetla wiersze węzła. */
  readonly wyroznionyModul?: string | null;
}

export function KartaModulu({
  opis,
  der,
  pozycja,
  stanOceny,
  szczegolyAudytowe,
  onNawiguj,
  wyroznionyModul = null,
}: KartaModuluProps): JSX.Element {
  const dane = daneModulu(opis, der);

  return (
    <div className="mvd-oze-pulpit-karta" data-testid="mvd-oze-pulpit-karta">
      {/* Sekcja 1 — dane modułu (read-only). */}
      <section
        className="mvd-oze-panel"
        data-testid="mvd-oze-pulpit-dane"
        aria-label={PULPIT_STRINGS.sekcjaDane}
      >
        <h4>{PULPIT_STRINGS.sekcjaDane}</h4>
        {/* Standard warsztatu KD6: dane modułu z modelu w jednej linii (etykieta · wartość). */}
        <div className="mvd-ncrfg-linia" data-testid="mvd-oze-pulpit-dane-linia">
          <span>
            <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.daneRodzaj}: </span>
            {dane.rodzaj}
          </span>
          <span>
            <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.daneMoc}: </span>
            <span className="mvd-oze-num">{formatMoc(dane.mocKw)}</span>
          </span>
          <span>
            <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.daneNapiecie}: </span>
            <span className="mvd-oze-num">{formatNapiecie(dane.napiecieKv)}</span>
          </span>
          <span>
            <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.daneStrona}: </span>
            {ETYKIETY_STRONY[dane.stronaPrzylaczenia]}
          </span>
        </div>
        <div className="mvd-ncrfg-linia" data-testid="mvd-oze-pulpit-odnosniki">
          <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.daneOdnosniki}:</span>
          <span>
            {dane.odnosniki.length === 0
              ? PULPIT_STRINGS.daneBrakOdnosnikow
              : dane.odnosniki.map((o) => o.etykieta).join(' · ')}
          </span>
          {/* Karta #145: identyfikatory pozycji katalogowych wyłącznie w „Informacjach
              audytowych" (tryb ekspercki, zwinięte) — pierwszy plan nazywa rodzaj odnośnika. */}
          <InformacjeAudytowe
            szczegolyAudytowe={szczegolyAudytowe}
            testid="mvd-oze-pulpit-odnosniki-audyt"
            wiersze={dane.odnosniki.map((o) => ({ etykieta: o.etykieta, wartosc: o.wartosc }))}
          />
        </div>
      </section>

      {/* Sekcja 2 — zgodność NC RfG. */}
      <SekcjaZgodnosci pozycja={pozycja} stanOceny={stanOceny} />

      {/* Sekcja 3 — praca magazynu (BESS z katalogu konwerterów). */}
      <SekcjaMagazynu der={der} szczegolyAudytowe={szczegolyAudytowe} />

      {/* Sekcja 4a — zdolność punktu przyłączenia (siła sieci, SCR/WSCR). */}
      <SekcjaSilySieci szczegolyAudytowe={szczegolyAudytowe} wyroznionyModul={wyroznionyModul} />

      {/* Sekcja 4b — adekwatność mocy biernej. */}
      <SekcjaAdekwatnosciQ szczegolyAudytowe={szczegolyAudytowe} wyroznionyModul={wyroznionyModul} />

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
