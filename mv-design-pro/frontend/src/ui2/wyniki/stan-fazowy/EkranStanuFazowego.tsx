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
 * DWA ŹRÓDŁA (karta W5-D): przebieg stanu fazowego SN (`PHASE_STATE_SN`, jak
 * wyżej) ALBO rozpływ niesymetryczny (`PF_UNBALANCED`, solver BFS per faza):
 * założenia biegu (solver, zbieżność, wyspy, statusy) → napięcia fazowe każdej
 * szyny + VUF z solvera → prądy fazowe gałęzi + straty → podsumowanie →
 * ZAŁOŻENIA biegu nazwane kodami kanonu → ograniczenia raportowe. Nazwa źródła
 * jest zawsze na ekranie; stan każdego wskaźnika jest podany PER ŹRÓDŁO
 * (odchylenie od średniej faz — solver stanu fazowego; VUF — rozpływ
 * niesymetryczny), bez zdania „nie jest liczony" tam, gdzie liczy drugi solver.
 *
 * Dane WYŁĄCZNIE z kanonicznych końcówek wyników (`api.ts`). ZERO fizyki,
 * ZERO mutacji modelu. Stylowanie tokenami --mvd-* (oba motywy z automatu).
 */

import './stan-fazowy.css';

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useShellStore } from '../../shell/useShellStore';
import { akcjaNaprawcza, SekcjaZalozen, useNazwaObiektu, usePoprawWModelu } from '../wzorzec';
import {
  fetchWynikiRozplywuNiesymetrycznego,
  fetchWynikiStanuFazowego,
  type WynikiRozplywuNiesymetrycznego,
  type WynikiStanuFazowego,
} from './api';
import {
  naPodsumowanieNiesymetrii,
  naPozycjeAsymetrii,
  naWierszeFaz,
  naWierszeGaleziNiesymetrycznych,
  naWierszeSzynNiesymetrycznych,
  naZalozeniaBiegu,
  naZalozeniaRozplywuNiesymetrycznego,
  naZalozeniaStanuFazowego,
  naZdarzeniaObwodu,
  wybierzPrzebiegFazowy,
  zrodloPrzebiegu,
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
  const zrodlo = przebieg ? zrodloPrzebiegu(przebieg) : null;

  const [wyniki, setWyniki] = useState<WynikiStanuFazowego | null>(null);
  const [wynikiRn, setWynikiRn] = useState<WynikiRozplywuNiesymetrycznego | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    if (!przebieg || !zrodlo) {
      setWyniki(null);
      setWynikiRn(null);
      return;
    }
    let aktywne = true;
    setLadowanie(true);
    setBlad(null);
    const pobranie =
      zrodlo === 'stan_fazowy'
        ? fetchWynikiStanuFazowego(przebieg.id).then((odp) => {
            if (aktywne) {
              setWyniki(odp);
              setWynikiRn(null);
            }
          })
        : fetchWynikiRozplywuNiesymetrycznego(przebieg.id).then((odp) => {
            if (aktywne) {
              setWynikiRn(odp);
              setWyniki(null);
            }
          });
    pobranie
      .catch((err: unknown) => {
        if (aktywne) setBlad(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (aktywne) setLadowanie(false);
      });
    return () => {
      aktywne = false;
    };
  }, [przebieg?.id, zrodlo]);

  const wiersz = wyniki && wyniki.run_id === przebieg?.id ? wyniki.rows[0] ?? null : null;
  const rn = wynikiRn && wynikiRn.run_id === przebieg?.id ? wynikiRn : null;
  const rnBezWierszy = rn !== null && rn.buses.length === 0;
  const zaladowane = zrodlo === 'stan_fazowy' ? wyniki !== null : rn !== null;
  const proofRef = zrodlo === 'stan_fazowy' ? wiersz?.proof_ref : rn?.proof_ref;

  const poprawWModelu = usePoprawWModelu();
  const nazwaObiektu = useNazwaObiektu();

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
      ) : ladowanie || !zaladowane ? (
        <div className="mvd-fazowy-stan" data-testid="mvd-fazowy-ladowanie" data-tone="loading">
          <p>{T.ladowanie}</p>
        </div>
      ) : (zrodlo === 'stan_fazowy' && !wiersz) || rnBezWierszy ? (
        <StanZerowy
          tytul={T.brakWierszyTytul}
          opis={T.brakWierszyOpis}
          akcja={T.brakPrzebieguAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          testid="mvd-fazowy-brak-wierszy"
        />
      ) : rn ? (
        <div data-testid="mvd-fazowy-rozplyw-niesymetryczny" data-zrodlo="rozplyw_niesymetryczny">
          <SekcjaZalozen zalozenia={naZalozeniaRozplywuNiesymetrycznego(rn)} />

          <section className="mvd-fazowy-sekcja" aria-label={T.rnSzynyTytul}>
            <h4>{T.rnSzynyTytul}</h4>
            <p className="mvd-fazowy-nota">{T.rnSzynyNota}</p>
            <div className="mvd-fazowy-tabela-wrap">
              <table className="mvd-fazowy-tabela" data-testid="mvd-fazowy-rn-szyny">
                <thead>
                  <tr>
                    <th>{T.rnKolSzyna}</th>
                    <th>
                      {T.rnKolUn} <span className="mvd-fazowy-jedn">[{T.jednKV}]</span>
                    </th>
                    <th>
                      {T.rnKolUA} <span className="mvd-fazowy-jedn">[{T.jednKV}]</span>
                    </th>
                    <th>
                      {T.rnKolUB} <span className="mvd-fazowy-jedn">[{T.jednKV}]</span>
                    </th>
                    <th>
                      {T.rnKolUC} <span className="mvd-fazowy-jedn">[{T.jednKV}]</span>
                    </th>
                    <th>
                      {T.rnKolVuf} <span className="mvd-fazowy-jedn">[{T.jednProcent}]</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {naWierszeSzynNiesymetrycznych(rn).map((s) => (
                    <tr key={s.id} data-testid="mvd-fazowy-rn-szyna" data-max-vuf={s.najwiekszyVuf || undefined}>
                      <td>{s.nazwa}</td>
                      <td className="mvd-num">{s.unKv}</td>
                      {s.fazy ? (
                        <>
                          <td className="mvd-num">{s.fazy.uA}</td>
                          <td className="mvd-num">{s.fazy.uB}</td>
                          <td className="mvd-num">{s.fazy.uC}</td>
                          <td className="mvd-num">{s.fazy.vuf}</td>
                        </>
                      ) : (
                        <td colSpan={4} className="mvd-fazowy-nota">
                          {T.rnNierozwiazana}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mvd-fazowy-sekcja" aria-label={T.rnGalezieTytul}>
            <h4>{T.rnGalezieTytul}</h4>
            <p className="mvd-fazowy-nota">{T.rnGalezieNota}</p>
            <div className="mvd-fazowy-tabela-wrap">
              <table className="mvd-fazowy-tabela" data-testid="mvd-fazowy-rn-galezie">
                <thead>
                  <tr>
                    <th>{T.rnKolGalaz}</th>
                    <th>{T.rnKolRodzaj}</th>
                    <th>
                      {T.rnKolIA} <span className="mvd-fazowy-jedn">[{T.jednA}]</span>
                    </th>
                    <th>
                      {T.rnKolIB} <span className="mvd-fazowy-jedn">[{T.jednA}]</span>
                    </th>
                    <th>
                      {T.rnKolIC} <span className="mvd-fazowy-jedn">[{T.jednA}]</span>
                    </th>
                    <th>
                      {T.rnKolIn} <span className="mvd-fazowy-jedn">[{T.jednA}]</span>
                    </th>
                    <th>
                      {T.rnKolStraty} <span className="mvd-fazowy-jedn">[{T.jednKW}]</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {naWierszeGaleziNiesymetrycznych(rn).map((g) => (
                    <tr key={g.id} data-testid="mvd-fazowy-rn-galaz">
                      <td>{g.nazwa}</td>
                      <td>{g.rodzaj}</td>
                      <td className="mvd-num">{g.iA}</td>
                      <td className="mvd-num">{g.iB}</td>
                      <td className="mvd-num">{g.iC}</td>
                      <td className="mvd-num">{g.iN}</td>
                      <td className="mvd-num">{g.stratyKw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mvd-fazowy-sekcja" aria-label={T.rnPodsumowanieTytul}>
            <h4>{T.rnPodsumowanieTytul}</h4>
            <dl className="mvd-fazowy-siatka" data-testid="mvd-fazowy-rn-podsumowanie">
              {naPodsumowanieNiesymetrii(rn).map((p) => (
                <div className="mvd-fazowy-pozycja" key={p.etykieta} data-werdykt="brak">
                  <dt>{p.etykieta}</dt>
                  <dd>
                    <span className="mvd-num">{p.wartosc}</span>
                    {p.jednostka ? (
                      <>
                        {' '}
                        <span className="mvd-fazowy-jedn">{p.jednostka}</span>
                      </>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mvd-fazowy-sekcja" aria-label={T.rnZalozeniaTytul}>
            <h4>{T.rnZalozeniaTytul}</h4>
            <p className="mvd-fazowy-nota">{T.rnZalozeniaNota}</p>
            {naZalozeniaBiegu(rn).length === 0 ? (
              <p className="mvd-fazowy-nota" data-testid="mvd-fazowy-rn-bez-zalozen">
                {T.rnBezZalozen}
              </p>
            ) : (
              <ul className="mvd-fazowy-zdarzenia" data-testid="mvd-fazowy-rn-zalozenia">
                {naZalozeniaBiegu(rn).map((z) => (
                  <li key={z.kod} data-kod={z.kod}>
                    <b>{z.opis}</b>
                    {z.elementy ? (
                      <>
                        {' '}
                        <span className="mvd-fazowy-jedn">
                          ({T.rnElementy}: {z.elementy})
                        </span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(rn.reporting_limitations_pl ?? []).length > 0 && (
            <section className="mvd-fazowy-sekcja" aria-label={T.ograniczeniaTytul}>
              <h4>{T.ograniczeniaTytul}</h4>
              <ul className="mvd-fazowy-zdarzenia" data-testid="mvd-fazowy-ograniczenia">
                {(rn.reporting_limitations_pl ?? []).map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : wiersz ? (
        <div data-testid="mvd-fazowy-stan-fazowy" data-zrodlo="stan_fazowy">
          <SekcjaZalozen zalozenia={naZalozeniaStanuFazowego(wiersz, nazwaObiektu)} />

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
                  poprawWModelu(ref, 'Bus', nazwaObiektu(ref, wiersz.target_name), 'asymetria-fazowa');
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

          {wiersz.reporting_limitations_pl.length > 0 && (
            <section className="mvd-fazowy-sekcja" aria-label={T.ograniczeniaTytul}>
              <h4>{T.ograniczeniaTytul}</h4>
              <ul className="mvd-fazowy-zdarzenia" data-testid="mvd-fazowy-ograniczenia">
                {wiersz.reporting_limitations_pl.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}

      <div className="mvd-fazowy-stopka">
        <span className="mvd-fazowy-lbl">{T.nastepnyEyebrow}</span>
        <p>{T.nastepnyOpis}</p>
        <div className="mvd-fazowy-stopka-akcje">
          {proofRef && (
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
