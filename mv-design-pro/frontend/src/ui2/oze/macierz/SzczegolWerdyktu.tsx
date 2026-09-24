/*
 * Ocena komórki macierzy (karta P39 §3; kontrakt V2 — karta AB-1a Pakiet D2 §3). Pokazuje
 * PEŁNY rekord `ocena` (`OcenaKryterium`) testu przez `KartaWerdyktu` — dowód, braki
 * („czego brakuje"), podstawa i zakres ważności są w rekordzie, nie w osobnej osi tego
 * panelu. Obok: definicja testu z katalogu biegu, wartości biegu i ślad WHITE BOX (wzory ASCII
 * solvera — `SladTestu`). Nawigacja do elementu modelu wyłącznie wtedy, gdy rekord niesie
 * odnośnik przedmiotu oceny (`ocena.przedmiot.element_ref`) — akcja INSPEKCYJNA, bez decyzji
 * klienta „co naprawić".
 */

import { useState } from 'react';

import { KartaWerdyktu } from '../../wyniki/wzorzec/KartaWerdyktu';
import { usePoprawWModelu } from '../../wyniki/wzorzec/usePoprawWModelu';
import { akcjaNaprawcza } from '../../wyniki/wzorzec/akcjeNaprawcze';
import type { ClaimKind } from '../../wyniki/wzorzec/werdykt';
import type { DefinicjaTestuNcRfg, KrokSladuNcRfg } from '../ncrfg/typy';
import type { KomorkaMacierzy } from './macierzModel';
import { SladTestu } from './SladTestu';
import { ETYKIETY_BLOKADY, MACIERZ_STRINGS, opiszMetryke } from './strings';

/** Rodzaj twierdzenia testu — opis słowny (lustro `proweniencja.ClaimKind.label_pl`). */
export function nazwaRodzajuTwierdzenia(rodzaj: ClaimKind): string {
  switch (rodzaj) {
    case 'DYNAMIC_PERFORMANCE':
      return 'zachowanie dynamiczne';
    case 'DECLARED_CONFIGURATION':
      return 'konfiguracja zadeklarowana';
    case 'STATIC_CALCULATION':
      return 'obliczenie statyczne';
  }
}

export interface SzczegolWerdyktuProps {
  readonly komorka: KomorkaMacierzy | null;
  readonly definicja: DefinicjaTestuNcRfg | null;
  readonly nazwaModulu: string | null;
  /** Pełny ślad WHITE BOX biegu — kroki testu filtrowane po `test_id`. */
  readonly slad: readonly KrokSladuNcRfg[];
  /**
   * Tryb ekspercki — identyfikator zdolności dowodowej (`zdolnosc_id`, metadana audytowa, nie
   * język inżynierski) tylko wtedy. Ten sam predykat co w wierszu macierzy (`MacierzNcRfg`
   * liczy go raz i podaje oba miejsca).
   */
  readonly trybEkspercki: boolean;
}

export function SzczegolWerdyktu({
  komorka,
  definicja,
  nazwaModulu,
  slad,
  trybEkspercki,
}: SzczegolWerdyktuProps): JSX.Element {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  const pokazElement = usePoprawWModelu();
  const akcjaInspekcji = akcjaNaprawcza('inspekcja-elementu');
  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-szczegol"
      aria-label={MACIERZ_STRINGS.szczegolTytul}
    >
      <h4>{MACIERZ_STRINGS.szczegolTytul}</h4>

      {!komorka ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-szczegol-pusty">
          {MACIERZ_STRINGS.szczegolWybierz}
        </p>
      ) : komorka.stan === 'brak_danych_modul' ? (
        <div className="mvd-oze-blokada" data-testid="mvd-oze-szczegol-blokada">
          {ETYKIETY_BLOKADY[komorka.powodModulu]}
        </div>
      ) : komorka.stan === 'brak_biegu' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-szczegol-brak-biegu">
          {MACIERZ_STRINGS.brakBieguOpis}
        </p>
      ) : (
        <div data-testid="mvd-oze-szczegol-wynik">
          <div className="mvd-oze-panel-blok">
            <span className="mvd-oze-panel-etyk">{nazwaModulu}</span>
            <div style={{ marginTop: 4, fontWeight: 600 }}>
              {komorka.wynik.test_id} · {komorka.wynik.ability_pl}
            </div>
          </div>

          <KartaWerdyktu rekord={komorka.wynik.ocena} />

          {komorka.wynik.ocena.przedmiot.element_ref ? (
            <div className="mvd-oze-panel-blok">
              <button
                type="button"
                className="mvd-btn"
                title={akcjaInspekcji.opis}
                onClick={() =>
                  pokazElement(
                    komorka.wynik.ocena.przedmiot.element_ref as string,
                    'Generator',
                    komorka.wynik.ocena.przedmiot.nazwa_pl,
                    'inspekcja-elementu',
                  )
                }
                data-testid="mvd-oze-szczegol-pokaz-element"
              >
                {akcjaInspekcji.etykieta}
              </button>
            </div>
          ) : null}

          {definicja ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-definicja">
              <div className="mvd-oze-metryka">
                <span>{MACIERZ_STRINGS.podstawaProcedury}</span>
                <span>{definicja.procedure_basis_pl}</span>
              </div>
              {definicja.conditional_pl ? (
                <div className="mvd-oze-metryka">
                  <span>{MACIERZ_STRINGS.warunekTestu}</span>
                  <span>{definicja.conditional_pl}</span>
                </div>
              ) : null}
              <div className="mvd-oze-metryka">
                <span>{MACIERZ_STRINGS.rodzajTwierdzenia}</span>
                <span>{nazwaRodzajuTwierdzenia(definicja.rodzaj_twierdzenia)}</span>
              </div>
              {trybEkspercki ? (
                <div className="mvd-oze-metryka" data-testid="mvd-oze-szczegol-zdolnosc">
                  <span>{MACIERZ_STRINGS.zdolnosc}</span>
                  <span className="mvd-oze-num">{definicja.zdolnosc_id}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-metryki">
            <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.metryki}</span>
            {Object.keys(komorka.wynik.metrics).length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {MACIERZ_STRINGS.brakMetryk}
              </p>
            ) : (
              <div style={{ marginTop: 4 }}>
                {Object.entries(komorka.wynik.metrics).map(([klucz, wartosc]) => (
                  <div key={klucz} className="mvd-oze-metryka">
                    <span className="mvd-oze-num">{klucz}</span>
                    <span className="mvd-oze-num">{opiszMetryke(wartosc)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {komorka.wynik.trace_refs.length > 0 ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-slad">
              <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.slad}</span>
              <div style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="mvd-oze-slad-btn"
                  aria-expanded={sladWidoczny}
                  onClick={() => setSladWidoczny((s) => !s)}
                  data-testid="mvd-oze-slad-otworz"
                >
                  {sladWidoczny ? MACIERZ_STRINGS.ukryjSlad : MACIERZ_STRINGS.otworzSlad}
                </button>
                {sladWidoczny && (
                  <SladTestu kroki={slad.filter((krok) => krok.test_id === komorka.testId)} />
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
