/*
 * Sekcja „Zgodność NC RfG" karty modułu (pulpit OZE, karta P47 §2.2; kontrakt V2 — karta
 * AB-1a Pakiet D2 §6). Pokazuje wynik modułu z oceny zatwierdzonego modelu: klasyfikację (typ
 * modułu z podstawą), technologię, źródło danych, dowód certyfikatu, powód odrzucenia tabliczki
 * albo jawny brak, wersję procedury oraz rekordy wymagań profilu (`ocena_wymagan[i].wymagania`)
 * — plakietka etykiety z rekordu, pełna `KartaWerdyktu` po kliknięciu. Moduł pominięty przez
 * serwer pokazuje powód serwera. Bez statusu modułu, liczników i map status → tekst.
 */

import { ListaRekordowWymagan, NaglowekModuluNcRfg } from '../ncrfg/komponenty';
import type { PozycjaModulu } from './pulpitModel';
import { PULPIT_STRINGS } from './strings';

export interface SekcjaZgodnosciProps {
  readonly pozycja: PozycjaModulu;
  /** Czy ocena modelu jest wczytana (odróżnia „bez oceny" od „moduł poza oceną"). */
  readonly ocenaWczytana: boolean;
}

export function SekcjaZgodnosci({ pozycja, ocenaWczytana }: SekcjaZgodnosciProps): JSX.Element {
  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-pulpit-zgodnosc"
      aria-label={PULPIT_STRINGS.sekcjaZgodnosc}
    >
      <h4>{PULPIT_STRINGS.sekcjaZgodnosc}</h4>

      {pozycja.wynik === null ? (
        pozycja.pominietyPowodPl !== null ? (
          <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-pulpit-zgodnosc-pominiety">
            {PULPIT_STRINGS.zgodnoscPominiety}: {pozycja.pominietyPowodPl}
          </p>
        ) : (
          <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-pulpit-zgodnosc-bez-oceny">
            {ocenaWczytana ? PULPIT_STRINGS.zgodnoscPozaOcena : PULPIT_STRINGS.zgodnoscBezOceny}
          </p>
        )
      ) : (
        <>
          <NaglowekModuluNcRfg
            modul={pozycja.wynik}
            odrzucony={pozycja.odrzucony}
            testid={`mvd-oze-pulpit-zgodnosc-naglowek-${pozycja.derRef}`}
          />
          <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.zgodnoscWymagania}</span>
          <ListaRekordowWymagan
            rekordy={pozycja.ocena?.wymagania ?? []}
            testid={`mvd-oze-pulpit-wymagania-${pozycja.derRef}`}
          />
        </>
      )}
    </section>
  );
}
