/*
 * Sekcja „Pokrycie analizami" przestrzeni „Gotowość" (karta ROUTERY-4A —
 * zdolność A3 macierzy pokrycia: `analysis/coverage_score` miało jedynego
 * konsumenta w nieosiągalnym raporcie). Punktacja kompletności pakietu analiz
 * przypadku + lista braków i luk krytycznych — wszystko wprost z backendu
 * (`GET /api/insights/analysis-coverage`), zero ocen lokalnych.
 *
 * Wzorzec zachowań: `SekcjaZgodnosciReferencyjnej` (rozwijalna sekcja, stany
 * pusty/ładowanie/błąd, `useActiveCaseId`). Brak przypadku → uczciwy stan
 * pusty PL bez wołania API.
 */

import { useEffect, useState } from 'react';
import { useActiveCaseId } from '../../../ui/app-state';
import { fetchPokrycieAnaliz, type PokrycieResponse } from './insightsApi';
import { GOTOWOSC_STRINGS } from './strings';

/** Klasa koloru punktacji (tokeny `--mvd-*`): ≥80 ok / ≥40 warn / <40 err. */
function klasaPunktacji(punkty: number): string {
  if (punkty >= 80) return 'mvd-ref-score-ok';
  if (punkty >= 40) return 'mvd-ref-score-warn';
  return 'mvd-ref-score-err';
}

export function SekcjaPokryciaAnaliz() {
  const caseId = useActiveCaseId();
  const [rozwinieta, setRozwinieta] = useState(true);
  const [dane, setDane] = useState<PokrycieResponse | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) {
      setDane(null);
      setBlad(null);
      setLadowanie(false);
      return;
    }
    let anulowane = false;
    setLadowanie(true);
    setBlad(null);
    fetchPokrycieAnaliz(caseId)
      .then((odpowiedz) => {
        if (!anulowane) setDane(odpowiedz);
      })
      .catch((err) => {
        if (!anulowane) {
          setBlad(err instanceof Error ? err.message : GOTOWOSC_STRINGS.pokrycieBlad);
        }
      })
      .finally(() => {
        if (!anulowane) setLadowanie(false);
      });
    return () => {
      anulowane = true;
    };
  }, [caseId]);

  const idTresci = 'mvd-pokrycie-sekcja-tresc';
  const widok = dane?.pokrycie ?? null;

  return (
    <section className="mvd-ref-sekcja" data-testid="mvd-pokrycie-sekcja">
      <button
        type="button"
        className="mvd-cel-naglowek"
        onClick={() => setRozwinieta((v) => !v)}
        aria-expanded={rozwinieta}
        aria-controls={idTresci}
      >
        <span className="mvd-cel-tytul">{GOTOWOSC_STRINGS.pokrycieSekcjaTytul}</span>
        <span className="mvd-cel-zwijak" aria-hidden="true">
          {rozwinieta ? GOTOWOSC_STRINGS.zwin : GOTOWOSC_STRINGS.rozwin}
        </span>
      </button>

      {rozwinieta && (
        <div id={idTresci} className="mvd-ref-tresc">
          <p className="mvd-ref-opis">{GOTOWOSC_STRINGS.pokrycieSekcjaOpis}</p>
          {!caseId ? (
            <p className="mvd-ref-stan" data-testid="mvd-pokrycie-brak-przypadku">
              {GOTOWOSC_STRINGS.pokrycieBrakPrzypadku}
            </p>
          ) : ladowanie ? (
            <p className="mvd-ref-stan" role="status" data-testid="mvd-pokrycie-ladowanie">
              {GOTOWOSC_STRINGS.pokrycieLadowanie}
            </p>
          ) : blad ? (
            <p className="mvd-ref-stan mvd-ref-stan-blad" role="alert" data-testid="mvd-pokrycie-blad">
              {GOTOWOSC_STRINGS.pokrycieBlad}
            </p>
          ) : widok ? (
            <div data-testid="mvd-pokrycie-tresc">
              <p className="mvd-pokrycie-wynik">
                <span>{GOTOWOSC_STRINGS.pokrycieWynik}: </span>
                <span
                  className={`mvd-num mvd-ref-score ${klasaPunktacji(widok.total_score)}`}
                  data-testid="mvd-pokrycie-punktacja"
                >
                  {widok.total_score.toFixed(0)} / 100
                </span>
              </p>
              {dane?.run_id === null && (
                <p className="mvd-ref-stan" data-testid="mvd-pokrycie-bez-biegu">
                  {GOTOWOSC_STRINGS.pokrycieBezBiegu}
                </p>
              )}
              {widok.missing_items.length === 0 && widok.critical_gaps.length === 0 ? (
                <p className="mvd-ref-stan" data-testid="mvd-pokrycie-bez-brakow">
                  {GOTOWOSC_STRINGS.pokrycieBezBrakow}
                </p>
              ) : (
                <>
                  {widok.critical_gaps.length > 0 && (
                    <>
                      <h4 className="mvd-pokrycie-podtytul">
                        {GOTOWOSC_STRINGS.pokrycieLukiTytul}
                      </h4>
                      <ul className="mvd-ref-checks" data-testid="mvd-pokrycie-luki">
                        {widok.critical_gaps.map((luka) => (
                          <li key={luka} className="mvd-ref-check">
                            <span className="mvd-ref-check-err" aria-hidden="true">
                              ✗
                            </span>
                            <span className="mvd-ref-check-msg">{luka}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {widok.missing_items.length > 0 && (
                    <>
                      <h4 className="mvd-pokrycie-podtytul">
                        {GOTOWOSC_STRINGS.pokrycieBrakiTytul}
                      </h4>
                      <ul className="mvd-ref-checks" data-testid="mvd-pokrycie-braki">
                        {widok.missing_items.map((brak) => (
                          <li key={brak} className="mvd-ref-check">
                            <span className="mvd-ref-check-msg">{brak}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
