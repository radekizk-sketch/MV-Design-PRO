/**
 * EkranStanuFazowego — REALNY dostawca ui2 ekranu kanonicznego E-31
 * „Stan fazowy SN" (karta P-2, FLOW §0.3 „kontrakt ekranu prowadzącego").
 * Zastępuje zastępczy `EkranKontraktuAnalizy` dla E-31 (precedens:
 * E-27 → `EkranZabezpieczenAutomatyki`, E-28 → `EkranKoordynacji`).
 *
 * Rama wg wzorca „ekran analizy = werdykt + wartości + założenia + ślad":
 *  - nagłówek: eyebrow + tytuł + JEDNO zdanie celu inżynierskiego,
 *  - stany zerowe: brak projektu / brak zakończonego przebiegu stanu fazowego →
 *    uczciwy stan z akcją naprawczą (`setActiveSpace`), NIE pusta tabela,
 *  - ZAŁOŻENIA (cel analizy + statusy) → tabela napięć/prądów/strat per faza →
 *    wskaźniki asymetrii z WERDYKTEM z flag solvera (zero progów w UI) →
 *    stan obwodu (zwarcie/otwarta faza) → ograniczenia raportowe →
 *    następny krok (dowód obliczeń / powrót do huba).
 *
 * Dane WYŁĄCZNIE z kanonicznej końcówki wyników (`api.ts` — klient dobudowany
 * addytywnie, backend nietknięty). ZERO fizyki, ZERO mutacji modelu.
 * Stylowanie tokenami --mvd-* (oba motywy z automatu).
 */

import './stan-fazowy.css';

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useShellStore } from '../../shell/useShellStore';
import { akcjaNaprawcza, SekcjaZalozen, usePoprawWModelu } from '../wzorzec';
import { fetchWynikiStanuFazowego, type WynikiStanuFazowego } from './api';
import {
  naPozycjeAsymetrii,
  naWierszeFaz,
  naZalozeniaStanuFazowego,
  naZdarzeniaObwodu,
  wybierzPrzebiegFazowy,
} from './stanFazowyModel';
import { STAN_FAZOWY_STRINGS as T } from './strings';

function StanZerowy({
  tytul,
  opis,
  akcja,
  onAkcja,
  testid,
}: {
  tytul: string;
  opis: string;
  akcja?: string;
  onAkcja?: () => void;
  testid: string;
}) {
  return (
    <div className="mvd-fazowy-stan" data-testid={testid} data-tone="idle">
      <h4>{tytul}</h4>
      <p>{opis}</p>
      {akcja && onAkcja && (
        <button
          type="button"
          className="mvd-fazowy-akcja"
          data-testid={`${testid}-akcja`}
          onClick={onAkcja}
        >
          {akcja}
        </button>
      )}
    </div>
  );
}

export function EkranStanuFazowego() {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);

  const przebieg = wybierzPrzebiegFazowy(przebiegi, activeRunId);

  const [wyniki, setWyniki] = useState<WynikiStanuFazowego | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    if (!przebieg) {
      setWyniki(null);
      return;
    }
    let aktywne = true;
    setLadowanie(true);
    setBlad(null);
    fetchWynikiStanuFazowego(przebieg.id)
      .then((odp) => {
        if (aktywne) setWyniki(odp);
      })
      .catch((err: unknown) => {
        if (aktywne) setBlad(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (aktywne) setLadowanie(false);
      });
    return () => {
      aktywne = false;
    };
  }, [przebieg?.id]);

  const wiersz = wyniki && wyniki.run_id === przebieg?.id ? wyniki.rows[0] ?? null : null;

  const poprawWModelu = usePoprawWModelu();

  const otworzDowod = () => {
    // Deep-link do okna „Dowód obliczeń" z kontekstem KONKRETNEGO przebiegu
    // (mechanizm R3-C — `WynikiWarsztat` konsumuje wynikiTabElement jako run_id).
    setWynikiTab('dowod', przebieg?.id ?? null);
    setActiveSpace('wyniki');
  };

  return (
    <div className="mvd-fazowy" data-testid="mvd-stan-fazowy">
      <header className="mvd-fazowy-head">
        <span className="mvd-fazowy-lbl">{T.eyebrow}</span>
        <h3>{T.tytul}</h3>
        <p className="mvd-fazowy-cel">{T.cel}</p>
      </header>

      {!activeProjectId ? (
        <StanZerowy
          tytul={T.brakProjektuTytul}
          opis={T.brakProjektuOpis}
          akcja={T.brakProjektuAkcja}
          onAkcja={() => setActiveSpace('projekt')}
          testid="mvd-fazowy-brak-projektu"
        />
      ) : !przebieg ? (
        <StanZerowy
          tytul={T.brakPrzebieguTytul}
          opis={T.brakPrzebieguOpis}
          akcja={T.brakPrzebieguAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          testid="mvd-fazowy-brak-przebiegu"
        />
      ) : blad ? (
        <div className="mvd-fazowy-stan" data-testid="mvd-fazowy-blad" data-tone="error" role="alert">
          <h4>{T.bladTytul}</h4>
          <p>{blad}</p>
        </div>
      ) : ladowanie || !wyniki ? (
        <div className="mvd-fazowy-stan" data-testid="mvd-fazowy-ladowanie" data-tone="loading">
          <p>{T.ladowanie}</p>
        </div>
      ) : !wiersz ? (
        <StanZerowy
          tytul={T.brakWierszyTytul}
          opis={T.brakWierszyOpis}
          akcja={T.brakPrzebieguAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          testid="mvd-fazowy-brak-wierszy"
        />
      ) : (
        <>
          <SekcjaZalozen zalozenia={naZalozeniaStanuFazowego(wiersz)} />

          <section className="mvd-fazowy-sekcja" aria-label={T.fazyTytul}>
            <h4>{T.fazyTytul}</h4>
            <div className="mvd-fazowy-tabela-wrap">
              <table className="mvd-fazowy-tabela" data-testid="mvd-fazowy-tabela-faz">
                <thead>
                  <tr>
                    <th>{T.kolFaza}</th>
                    <th>
                      {T.kolNapiecie} <span className="mvd-fazowy-jedn">[{T.jednKV}]</span>
                    </th>
                    <th>
                      {T.kolPrad} <span className="mvd-fazowy-jedn">[{T.jednA}]</span>
                    </th>
                    <th>
                      {T.kolStraty} <span className="mvd-fazowy-jedn">[{T.jednKW}]</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {naWierszeFaz(wiersz).map((f) => (
                    <tr key={f.faza}>
                      <td>{f.faza}</td>
                      <td className="mvd-num">{f.napiecieKv}</td>
                      <td className="mvd-num">{f.pradA}</td>
                      <td className="mvd-num">{f.stratyKw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mvd-fazowy-sekcja" aria-label={T.asymetriaTytul}>
            <h4>{T.asymetriaTytul}</h4>
            <p className="mvd-fazowy-nota">{T.asymetriaOpis}</p>
            <dl className="mvd-fazowy-siatka" data-testid="mvd-fazowy-asymetrie">
              {naPozycjeAsymetrii(wiersz).map((p) => (
                <div className="mvd-fazowy-pozycja" key={p.etykieta} data-werdykt={p.werdykt}>
                  <dt>{p.etykieta}</dt>
                  <dd>
                    <span className="mvd-num">{p.wartosc}</span>{' '}
                    <span className="mvd-fazowy-jedn">{T.jednProcent}</span>
                    <span className="mvd-fazowy-chip" data-werdykt={p.werdykt}>
                      {p.werdykt === 'przekroczenie'
                        ? T.werdyktPrzekroczenie
                        : p.werdykt === 'w-normie'
                          ? T.werdyktWNormie
                          : T.werdyktBrak}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            {/* F-K4 (znalezisko Z4): przekroczona asymetria prowadzi do SZYNY w
                modelu — projektant widzi problem i ma stąd drogę do jego
                przyczyny. Przycisk pojawia się WYŁĄCZNIE przy realnym
                przekroczeniu (flaga solvera), nigdy „na wszelki wypadek". */}
            {naPozycjeAsymetrii(wiersz).some((p) => p.werdykt === 'przekroczenie') && (
              <button
                type="button"
                className="mvd-fazowy-popraw"
                data-testid="mvd-fazowy-popraw"
                title={akcjaNaprawcza('asymetria-fazowa').opis}
                onClick={() => {
                  const ref = wiersz.element_id || wiersz.target_id;
                  poprawWModelu(ref, 'Bus', wiersz.target_name || ref, 'asymetria-fazowa');
                }}
              >
                {akcjaNaprawcza('asymetria-fazowa').etykieta}
              </button>
            )}
          </section>

          <section className="mvd-fazowy-sekcja" aria-label={T.stanTytul}>
            <h4>{T.stanTytul}</h4>
            {naZdarzeniaObwodu(wiersz).length === 0 ? (
              <p className="mvd-fazowy-nota" data-testid="mvd-fazowy-bez-zdarzen">
                {T.stanBrakZdarzen}
              </p>
            ) : (
              <ul className="mvd-fazowy-zdarzenia" data-testid="mvd-fazowy-zdarzenia">
                {naZdarzeniaObwodu(wiersz).map((z) => (
                  <li key={z.etykieta}>
                    <b>{z.etykieta}:</b> {z.fazy || T.kreska}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {wiersz.reporting_limitations.length > 0 && (
            <section className="mvd-fazowy-sekcja" aria-label={T.ograniczeniaTytul}>
              <h4>{T.ograniczeniaTytul}</h4>
              <ul className="mvd-fazowy-zdarzenia" data-testid="mvd-fazowy-ograniczenia">
                {wiersz.reporting_limitations.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="mvd-fazowy-stopka">
        <span className="mvd-fazowy-lbl">{T.nastepnyEyebrow}</span>
        <p>{T.nastepnyOpis}</p>
        <div className="mvd-fazowy-stopka-akcje">
          {wiersz?.proof_ref && (
            <button
              type="button"
              className="mvd-fazowy-nastepny"
              data-testid="mvd-fazowy-otworz-dowod"
              onClick={otworzDowod}
            >
              {T.akcjaDowod}
            </button>
          )}
          <button
            type="button"
            className="mvd-fazowy-powrot"
            data-testid="mvd-fazowy-powrot"
            title={T.powrotOpis}
            onClick={clearRouteManagedSurface}
          >
            {T.powrotHub}
          </button>
        </div>
      </div>
    </div>
  );
}
