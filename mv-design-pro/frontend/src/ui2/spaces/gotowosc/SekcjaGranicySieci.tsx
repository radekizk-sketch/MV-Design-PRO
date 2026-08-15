/*
 * Sekcja „Granica sieci (węzeł przyłączenia)" przestrzeni „Gotowość"
 * (karta ROUTERY-4A — zdolność A2 macierzy pokrycia: `analysis/boundary`
 * nie miało ŻADNEGO konsumenta produkcyjnego). Interpretacja BIEŻĄCEGO modelu
 * przypadku — wynik (szyna, metoda, ufność) albo uczciwa diagnostyka PL,
 * wszystko wprost z backendu (`GET /api/insights/network-boundary`).
 *
 * Wzorzec zachowań: `SekcjaZgodnosciReferencyjnej` (rozwijalna sekcja, stany
 * pusty/ładowanie/błąd, `useActiveCaseId`). Brak przypadku → uczciwy stan
 * pusty PL bez wołania API.
 */

import { useEffect, useState } from 'react';
import { useActiveCaseId } from '../../../ui/app-state';
import { fetchGranicaSieci, type GranicaResponse } from './insightsApi';
import { GOTOWOSC_STRINGS } from './strings';

export function SekcjaGranicySieci() {
  const caseId = useActiveCaseId();
  const [rozwinieta, setRozwinieta] = useState(true);
  const [dane, setDane] = useState<GranicaResponse | null>(null);
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
    fetchGranicaSieci(caseId)
      .then((odpowiedz) => {
        if (!anulowane) setDane(odpowiedz);
      })
      .catch((err) => {
        if (!anulowane) {
          setBlad(err instanceof Error ? err.message : GOTOWOSC_STRINGS.granicaBlad);
        }
      })
      .finally(() => {
        if (!anulowane) setLadowanie(false);
      });
    return () => {
      anulowane = true;
    };
  }, [caseId]);

  const idTresci = 'mvd-granica-sekcja-tresc';

  return (
    <section className="mvd-ref-sekcja" data-testid="mvd-granica-sekcja">
      <button
        type="button"
        className="mvd-cel-naglowek"
        onClick={() => setRozwinieta((v) => !v)}
        aria-expanded={rozwinieta}
        aria-controls={idTresci}
      >
        <span className="mvd-cel-tytul">{GOTOWOSC_STRINGS.granicaSekcjaTytul}</span>
        <span className="mvd-cel-zwijak" aria-hidden="true">
          {rozwinieta ? GOTOWOSC_STRINGS.zwin : GOTOWOSC_STRINGS.rozwin}
        </span>
      </button>

      {rozwinieta && (
        <div id={idTresci} className="mvd-ref-tresc">
          <p className="mvd-ref-opis">{GOTOWOSC_STRINGS.granicaSekcjaOpis}</p>
          {!caseId ? (
            <p className="mvd-ref-stan" data-testid="mvd-granica-brak-przypadku">
              {GOTOWOSC_STRINGS.granicaBrakPrzypadku}
            </p>
          ) : ladowanie ? (
            <p className="mvd-ref-stan" role="status" data-testid="mvd-granica-ladowanie">
              {GOTOWOSC_STRINGS.granicaLadowanie}
            </p>
          ) : blad ? (
            <p className="mvd-ref-stan mvd-ref-stan-blad" role="alert" data-testid="mvd-granica-blad">
              {GOTOWOSC_STRINGS.granicaBlad}
            </p>
          ) : dane ? (
            dane.znaleziono && dane.wezel_przylaczenia ? (
              <dl className="mvd-granica-dane" data-testid="mvd-granica-wynik">
                <div className="mvd-granica-para">
                  <dt>{GOTOWOSC_STRINGS.granicaWezel}</dt>
                  <dd data-testid="mvd-granica-wezel">
                    {dane.wezel_przylaczenia.name}
                    {' '}
                    <span className="mvd-muted mvd-num">
                      ({dane.wezel_przylaczenia.voltage_kv} kV)
                    </span>
                  </dd>
                </div>
                <div className="mvd-granica-para">
                  <dt>{GOTOWOSC_STRINGS.granicaMetoda}</dt>
                  <dd data-testid="mvd-granica-metoda">{dane.metoda_pl ?? dane.metoda}</dd>
                </div>
                <div className="mvd-granica-para">
                  <dt>{GOTOWOSC_STRINGS.granicaUfnosc}</dt>
                  <dd className="mvd-num" data-testid="mvd-granica-ufnosc">
                    {(dane.ufnosc * 100).toFixed(0)}%
                  </dd>
                </div>
              </dl>
            ) : (
              <div data-testid="mvd-granica-nieznaleziona">
                <p className="mvd-ref-stan">{GOTOWOSC_STRINGS.granicaNieznaleziona}</p>
                {dane.diagnostyka.length > 0 && (
                  <>
                    <h4 className="mvd-pokrycie-podtytul">
                      {GOTOWOSC_STRINGS.granicaDiagnostyka}
                    </h4>
                    <ul className="mvd-ref-checks" data-testid="mvd-granica-diagnostyka">
                      {dane.diagnostyka.map((wpis) => (
                        <li key={wpis.kod} className="mvd-ref-check">
                          <span className="mvd-ref-check-msg">{wpis.opis_pl}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )
          ) : null}
        </div>
      )}
    </section>
  );
}
