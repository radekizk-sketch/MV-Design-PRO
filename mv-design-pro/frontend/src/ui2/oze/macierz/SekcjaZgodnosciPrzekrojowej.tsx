/*
 * Sekcja „Zgodność przypadku (zatwierdzony model)" (karta S-3; kontrakt V2 — karta AB-1a
 * Pakiet D2 §3) — obok macierzy biegu „co-jeśli". Czyta
 * `GET /api/ncrfg-tests/cases/{case_id}/compliance`: rekordy oceny WSZYSTKICH źródeł
 * przekształtnikowych modelu, liczone tym samym solverem i tą samą oceną wymagań co
 * certyfikat; dowód certyfikatu urządzenia wyprowadza serwer.
 *
 * Granice (NOT-A-SOLVER): per moduł — nagłówek z klasyfikacją, technologią, źródłem danych,
 * dowodem certyfikatu (albo powodem odrzucenia tabliczki, albo jawnym brakiem) i wersją
 * procedury, oraz rekordy `WynikWymagania` (plakietka + karta). Zero statusu modułu, zero
 * liczników, zero map status → tekst.
 */

import { useCallback, useEffect, useState } from 'react';

import { InformacjeAudytowe } from '../../wyniki/wzorzec/InformacjeAudytowe';
import { pobierzZgodnoscPrzypadkuNcRfg } from '../ncrfg/api';
import { ListaRekordowWymagan, NaglowekModuluNcRfg } from '../ncrfg/komponenty';
import type { ZgodnoscPrzypadkuNcRfg } from '../ncrfg/typy';
import { MACIERZ_STRINGS, formatMoc, formatNapiecie } from './strings';
import {
  nazwaModuluPrzekrojowego,
  rozwiazStanZgodnosciPrzekrojowej,
} from './zgodnoscPrzekrojowaModel';

export interface SekcjaZgodnosciPrzekrojowejProps {
  /** Aktywny przypadek; `null` = brak (uczciwy stan zerowy, zero zapytania). */
  readonly caseId: string | null;
  /** Operator (profil wymagań) — z modelu albo jawny wybór; `null` = jeszcze niewybrany. */
  readonly operatorId: string | null;
  /** der_ref → nazwa wyświetlana, z tego samego źródła co kolumny macierzy obok. */
  readonly nazwyModulow: Readonly<Record<string, string>>;
  /** Tryb ekspercki — odciski biegu w informacjach audytowych. */
  readonly trybEkspercki: boolean;
  /**
   * Odesłanie do macierzy: wybiera moduł (panel modułu + kolumna). Renderowane tylko dla
   * modułów znanych macierzy (klucz w `nazwyModulow`) — bez martwego kliku.
   */
  readonly onWybierzModul?: (derRef: string) => void;
}

export function SekcjaZgodnosciPrzekrojowej({
  caseId,
  operatorId,
  nazwyModulow,
  trybEkspercki,
  onWybierzModul,
}: SekcjaZgodnosciPrzekrojowejProps): JSX.Element {
  const [wynik, setWynik] = useState<ZgodnoscPrzypadkuNcRfg | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  const zaladuj = useCallback(async (): Promise<void> => {
    if (!caseId || !operatorId) return;
    setLadowanie(true);
    setBlad(null);
    try {
      setWynik(await pobierzZgodnoscPrzypadkuNcRfg(caseId, operatorId));
    } catch (err) {
      setWynik(null);
      setBlad(err instanceof Error ? err.message : MACIERZ_STRINGS.zgodnoscPrzekrojowaBlad);
    } finally {
      setLadowanie(false);
    }
  }, [caseId, operatorId]);

  useEffect(() => {
    setWynik(null);
    void zaladuj();
  }, [zaladuj]);

  const stan = rozwiazStanZgodnosciPrzekrojowej({ caseId, operatorId, ladowanie, blad, wynik });
  const bieg = wynik?.bieg ?? null;
  const odrzucone = new Map((wynik?.certyfikaty_odrzucone ?? []).map((o) => [o.der_ref, o]));

  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-zgodnosc-przekrojowa"
      aria-label={MACIERZ_STRINGS.zgodnoscPrzekrojowaTytul}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h4>{MACIERZ_STRINGS.zgodnoscPrzekrojowaTytul}</h4>
        <button
          type="button"
          className="mvd-btn"
          onClick={() => void zaladuj()}
          disabled={!caseId || !operatorId || ladowanie}
          data-testid="mvd-oze-zgodnosc-przekrojowa-odswiez"
        >
          {ladowanie
            ? MACIERZ_STRINGS.zgodnoscPrzekrojowaLadowanie
            : MACIERZ_STRINGS.zgodnoscPrzekrojowaOdswiez}
        </button>
      </div>
      <p className="mvd-oze-panel-etyk" style={{ textTransform: 'none' }}>
        {MACIERZ_STRINGS.zgodnoscPrzekrojowaOpis}
      </p>

      {stan === 'brak_przypadku' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-zgodnosc-przekrojowa-brak-przypadku">
          {MACIERZ_STRINGS.zgodnoscPrzekrojowaBrakPrzypadku}
        </p>
      ) : stan === 'brak_operatora' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-zgodnosc-przekrojowa-brak-operatora">
          {MACIERZ_STRINGS.zgodnoscPrzekrojowaBrakOperatora}
        </p>
      ) : stan === 'blad' ? (
        <div className="mvd-oze-blad" role="alert" data-testid="mvd-oze-zgodnosc-przekrojowa-blad">
          {MACIERZ_STRINGS.zgodnoscPrzekrojowaBlad}: {blad}
        </div>
      ) : stan === 'ladowanie' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-zgodnosc-przekrojowa-ladowanie">
          {MACIERZ_STRINGS.zgodnoscPrzekrojowaLadowanie}
        </p>
      ) : stan === 'brak_der' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-zgodnosc-przekrojowa-brak-der">
          {MACIERZ_STRINGS.zgodnoscPrzekrojowaBrakDer}
        </p>
      ) : wynik ? (
        <div className="mvd-oze-przekroj" data-testid="mvd-oze-zgodnosc-przekrojowa-moduly">
          {(bieg?.modules ?? []).map((modul, indeks) => {
            const ocena = bieg?.ocena_wymagan[indeks] ?? null;
            const nazwa = nazwaModuluPrzekrojowego(modul.der_ref, modul.der_name, nazwyModulow);
            const wMacierzy = onWybierzModul !== undefined && modul.der_ref in nazwyModulow;
            return (
              <article
                key={modul.der_ref}
                className="mvd-oze-przekroj-modul"
                data-testid={`mvd-oze-zgodnosc-przekrojowa-modul-${modul.der_ref}`}
              >
                <header className="mvd-oze-przekroj-naglowek">
                  <h5 className="mvd-oze-przekroj-tytul">{nazwa}</h5>
                  <span className="mvd-oze-num mvd-oze-panel-etyk">
                    {formatMoc(modul.p_max_kw)} · {formatNapiecie(modul.voltage_kv)} ·{' '}
                    {modul.operator_name_pl}
                  </span>
                  {wMacierzy ? (
                    <button
                      type="button"
                      className="mvd-btn"
                      onClick={() => onWybierzModul?.(modul.der_ref)}
                      data-testid={`mvd-oze-zgodnosc-przekrojowa-pokaz-${modul.der_ref}`}
                    >
                      {MACIERZ_STRINGS.zgodnoscPrzekrojowaPokazWMacierzy}
                    </button>
                  ) : null}
                </header>
                <NaglowekModuluNcRfg
                  modul={modul}
                  odrzucony={odrzucone.get(modul.der_ref) ?? null}
                  testid={`mvd-oze-zgodnosc-przekrojowa-naglowek-${modul.der_ref}`}
                />
                <ListaRekordowWymagan
                  rekordy={ocena?.wymagania ?? []}
                  testid={`mvd-oze-zgodnosc-przekrojowa-wymagania-${modul.der_ref}`}
                />
              </article>
            );
          })}

          {wynik.pominiete.length > 0 ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-zgodnosc-przekrojowa-pominiete">
              <span className="mvd-oze-panel-etyk">
                {MACIERZ_STRINGS.zgodnoscPrzekrojowaPominieteTytul}
              </span>
              <ul className="mvd-oze-lista">
                {wynik.pominiete.map((der) => (
                  <li
                    key={der.der_ref}
                    data-testid={`mvd-oze-zgodnosc-przekrojowa-pominiety-${der.der_ref}`}
                  >
                    <strong>{nazwaModuluPrzekrojowego(der.der_ref, der.der_name, nazwyModulow)}</strong>
                    {': '}
                    {der.powod_pl}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {bieg ? (
            <InformacjeAudytowe
              trybEkspercki={trybEkspercki}
              testid="mvd-oze-zgodnosc-przekrojowa-audyt"
              wiersze={[
                { etykieta: MACIERZ_STRINGS.odciskWejsciaBiegu, wartosc: bieg.input_hash },
                { etykieta: MACIERZ_STRINGS.odciskBiegu, wartosc: bieg.deterministic_hash },
                { etykieta: MACIERZ_STRINGS.wersjaSolvera, wartosc: bieg.solver_version },
              ]}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
