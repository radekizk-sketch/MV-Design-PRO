/**
 * EkranZbieznosci — REALNY dostawca ui2 ekranu kanonicznego E-30
 * „Zbieżność rozpływu i zaczepy" (karta P-2, FLOW §0.3 „kontrakt ekranu
 * prowadzącego"). Zastępuje zastępczy `EkranKontraktuAnalizy` dla E-30
 * (precedens: E-27 → `EkranZabezpieczenAutomatyki`, E-28 → `EkranKoordynacji`).
 *
 * Rama wg wzorca „ekran analizy = werdykt + wartości + założenia + ślad":
 *  - nagłówek: eyebrow + tytuł + JEDNO zdanie celu inżynierskiego,
 *  - stany zerowe: brak projektu / brak zakończonego przebiegu rozpływu →
 *    uczciwy stan z akcją naprawczą (`setActiveSpace`), NIE pusta tabela,
 *  - ZAŁOŻENIA (SekcjaZalozen wzorca) → WERDYKT zbieżności → bilans przebiegu →
 *    regulacja zaczepów przebiegu (ślad OLTC) → założenia zaczepów modelu →
 *    ślad iteracji NA ŻĄDANIE → następny krok (wyniki rozpływu / badania OLTC).
 *
 * Dane WYŁĄCZNIE z istniejących kontraktów read-only (mapowanie w
 * `zbieznoscModel.ts`); populacja store'u tymi samymi akcjami co warstwa
 * integracyjna (`ui2/spaces/wyniki/useWpiecieWynikow.ts`: selectRun +
 * loadResults; tu dodatkowo loadTrace — ślad zbieżności i pętli OLTC).
 * ZERO fizyki, ZERO mutacji modelu. Stylowanie tokenami --mvd-* (oba motywy).
 */

import './zbieznosc.css';

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { usePowerFlowResultsStore } from '../../../ui/power-flow-results/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useShellStore } from '../../shell/useShellStore';
import { akcjaNaprawcza, SekcjaZalozen, usePoprawWModelu, WZORZEC_STRINGS } from '../wzorzec';
import {
  naBilansPrzebiegu,
  naWierszeIteracji,
  naWierszeWysp,
  naWierszeOltcPrzebiegu,
  naWierszeZaczepowModelu,
  naZalozeniaZbieznosci,
  wybierzPrzebiegRozplywu,
} from './zbieznoscModel';
import { ZBIEZNOSC_STRINGS as T } from './strings';

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
    <div className="mvd-zbieznosc-stan" data-testid={testid} data-tone="idle">
      <h4>{tytul}</h4>
      <p>{opis}</p>
      {akcja && onAkcja && (
        <button
          type="button"
          className="mvd-zbieznosc-akcja"
          data-testid={`${testid}-akcja`}
          onClick={onAkcja}
        >
          {akcja}
        </button>
      )}
    </div>
  );
}

export function EkranZbieznosci() {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);

  const wynik = usePowerFlowResultsStore((s) => s.results);
  const slad = usePowerFlowResultsStore((s) => s.trace);
  const selectedRunId = usePowerFlowResultsStore((s) => s.selectedRunId);
  const isLoadingTrace = usePowerFlowResultsStore((s) => s.isLoadingTrace);
  const blad = usePowerFlowResultsStore((s) => s.error);

  const [sladRozwiniety, setSladRozwiniety] = useState(false);

  const przebieg = wybierzPrzebiegRozplywu(przebiegi, activeRunId);

  // Populacja store'u — te same akcje co useWpiecieWynikow (idempotentnie),
  // plus ślad solvera (zbieżność iteracji + pętla OLTC).
  useEffect(() => {
    if (!przebieg) return;
    const store = usePowerFlowResultsStore.getState();
    const zaladuj = async () => {
      if (store.selectedRunId !== przebieg.id || store.results == null) {
        await store.selectRun(przebieg.id);
        await usePowerFlowResultsStore.getState().loadResults();
      }
      if (usePowerFlowResultsStore.getState().trace == null) {
        await usePowerFlowResultsStore.getState().loadTrace();
      }
    };
    void zaladuj();
  }, [przebieg?.id]);

  const wynikAktualny = przebieg && selectedRunId === przebieg.id ? wynik : null;
  const sladAktualny = przebieg && selectedRunId === przebieg.id ? slad : null;
  const oltc = sladAktualny?.oltc_control ?? null;
  const wierszeWysp = naWierszeWysp(sladAktualny);
  const wierszeModelu = naWierszeZaczepowModelu(snapshot);
  const poprawWModelu = usePoprawWModelu();

  const otworzWyniki = (tab: string) => {
    setWynikiTab(tab);
    setActiveSpace('wyniki');
  };

  return (
    <div className="mvd-zbieznosc" data-testid="mvd-zbieznosc">
      <header className="mvd-zbieznosc-head">
        <span className="mvd-zbieznosc-lbl">{T.eyebrow}</span>
        <h3>{T.tytul}</h3>
        <p className="mvd-zbieznosc-cel">{T.cel}</p>
      </header>

      {!activeProjectId ? (
        <StanZerowy
          tytul={T.brakProjektuTytul}
          opis={T.brakProjektuOpis}
          akcja={T.brakProjektuAkcja}
          onAkcja={() => setActiveSpace('projekt')}
          testid="mvd-zbieznosc-brak-projektu"
        />
      ) : !przebieg ? (
        <StanZerowy
          tytul={T.brakPrzebieguTytul}
          opis={T.brakPrzebieguOpis}
          akcja={T.brakPrzebieguAkcja}
          onAkcja={() => setActiveSpace('obliczenia')}
          testid="mvd-zbieznosc-brak-przebiegu"
        />
      ) : blad && !wynikAktualny ? (
        // Błąd blokuje ekran tylko, gdy nie ma wyniku; błąd samego śladu
        // (np. ślad niedostępny) NIE zasłania wyniku — sekcja OLTC pokaże
        // uczciwą informację o niedostępności śladu.
        <div className="mvd-zbieznosc-stan" data-testid="mvd-zbieznosc-blad" data-tone="error" role="alert">
          <h4>{T.bladTytul}</h4>
          <p>{blad}</p>
        </div>
      ) : !wynikAktualny ? (
        <div className="mvd-zbieznosc-stan" data-testid="mvd-zbieznosc-ladowanie" data-tone="loading">
          <p>{T.ladowanieWyniku}</p>
        </div>
      ) : (
        <>
          <SekcjaZalozen zalozenia={naZalozeniaZbieznosci(wynikAktualny, sladAktualny)} />

          <section
            className="mvd-zbieznosc-werdykt"
            data-testid="mvd-zbieznosc-werdykt"
            data-werdykt={wynikAktualny.converged ? 'zbiezny' : 'niezbiezny'}
          >
            <span className="mvd-zbieznosc-lbl">{T.werdyktEyebrow}</span>
            <h4>{wynikAktualny.converged ? T.werdyktZbiezny : T.werdyktNiezbiezny}</h4>
            <p>
              {wynikAktualny.converged
                ? T.werdyktZbieznyOpis(wynikAktualny.iterations_count)
                : T.werdyktNiezbieznyOpis(wynikAktualny.iterations_count)}
            </p>
            {!wynikAktualny.converged && (
              <>
                <p className="mvd-zbieznosc-instrukcja" data-testid="mvd-zbieznosc-instrukcja">
                  {T.werdyktNiezbieznyInstrukcja}
                </p>
                <button
                  type="button"
                  className="mvd-zbieznosc-akcja"
                  data-testid="mvd-zbieznosc-napraw-akcja"
                  onClick={() => setActiveSpace('obliczenia')}
                >
                  {T.brakPrzebieguAkcja}
                </button>
              </>
            )}
          </section>

          <section className="mvd-zbieznosc-sekcja" aria-label={T.bilansTytul}>
            <h4>{T.bilansTytul}</h4>
            <dl className="mvd-zbieznosc-siatka" data-testid="mvd-zbieznosc-bilans">
              {naBilansPrzebiegu(wynikAktualny).map((p) => (
                <div className="mvd-zbieznosc-pozycja" key={p.etykieta}>
                  <dt>{p.etykieta}</dt>
                  <dd className="mvd-num">
                    {p.wartosc} <span className="mvd-zbieznosc-jedn">{p.jednostka}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {wierszeWysp.length >= 2 && (
            <section className="mvd-zbieznosc-sekcja" aria-label={T.wyspyTytul}>
              <h4>{T.wyspyTytul}</h4>
              <p className="mvd-zbieznosc-nota">{T.wyspyOpis}</p>
              <div className="mvd-zbieznosc-tabela-wrap">
                <table className="mvd-zbieznosc-tabela" data-testid="mvd-zbieznosc-wyspy-tabela">
                  <thead>
                    <tr>
                      <th>{T.wyspyKolSzyna}</th>
                      <th>{T.wyspyKolZrodlo}</th>
                      <th>{T.wyspyKolSzynyPq}</th>
                      <th>{T.wyspyKolSzynyPv}</th>
                      <th>{T.wyspyKolIteracje}</th>
                      <th>{T.wyspyKolZbieznosc}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wierszeWysp.map((w) => (
                      <tr key={w.szynaBilansujaca} data-testid={`mvd-zbieznosc-wyspa-${w.szynaBilansujaca}`}>
                        <td className="mvd-zbieznosc-id">{w.szynaBilansujaca}</td>
                        <td className="mvd-zbieznosc-id">{w.zrodloRef}</td>
                        <td className="mvd-num">{w.liczbaSzynPq}</td>
                        <td className="mvd-num">{w.liczbaSzynPv}</td>
                        <td className="mvd-num">{w.iteracje}</td>
                        <td>{w.zbiezna ? T.wyspyZbiezna : T.wyspyNiezbiezna}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mvd-zbieznosc-sekcja" aria-label={T.oltcTytul}>
            <h4>{T.oltcTytul}</h4>
            {isLoadingTrace && !sladAktualny ? (
              <p className="mvd-zbieznosc-nota">{T.oltcLadowanie}</p>
            ) : !sladAktualny ? (
              <p className="mvd-zbieznosc-nota" data-testid="mvd-zbieznosc-oltc-brak-sladu">
                {T.oltcSladNiedostepny}
              </p>
            ) : !oltc ? (
              <p className="mvd-zbieznosc-nota" data-testid="mvd-zbieznosc-oltc-brak">
                {T.oltcBrakWSladzie}
              </p>
            ) : (
              <>
                <p className="mvd-zbieznosc-nota">{T.oltcOpis}</p>
                <div className="mvd-zbieznosc-tabela-wrap">
                  <table className="mvd-zbieznosc-tabela" data-testid="mvd-zbieznosc-oltc-tabela">
                    <thead>
                      <tr>
                        <th>{T.oltcKolTransformator}</th>
                        <th>{T.oltcKolStrona}</th>
                        <th>{T.oltcKolSzynaKontrolowana}</th>
                        <th>{T.oltcKolZadana}</th>
                        <th>{T.oltcKolPozycjaPoczatkowa}</th>
                        <th>{T.oltcKolPozycjaKoncowa}</th>
                        <th>{T.oltcKolZakres}</th>
                        <th>{T.oltcKolPrzelaczenia}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {naWierszeOltcPrzebiegu(oltc).map((w) => (
                        <tr key={w.branchId}>
                          <td className="mvd-zbieznosc-id">{w.branchId}</td>
                          <td>{w.strona}</td>
                          <td className="mvd-zbieznosc-id">{w.szynaKontrolowana}</td>
                          <td className="mvd-num">{w.zadanaKv}</td>
                          <td className="mvd-num">{w.pozycjaPoczatkowa}</td>
                          <td className="mvd-num">{w.pozycjaKoncowa}</td>
                          <td className="mvd-num">{w.zakres}</td>
                          <td className="mvd-num">{w.przelaczenia}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="mvd-zbieznosc-sekcja" aria-label={T.modelTytul}>
            <h4>{T.modelTytul}</h4>
            {!snapshot ? (
              <p className="mvd-zbieznosc-nota" data-testid="mvd-zbieznosc-model-brak-snapshotu">
                {T.modelBrakSnapshotu}
              </p>
            ) : wierszeModelu.length === 0 ? (
              <p className="mvd-zbieznosc-nota" data-testid="mvd-zbieznosc-model-brak">
                {T.modelBrakTransformatorow}
              </p>
            ) : (
              <>
                <p className="mvd-zbieznosc-nota">{T.modelOpis}</p>
                <div className="mvd-zbieznosc-tabela-wrap">
                  <table className="mvd-zbieznosc-tabela" data-testid="mvd-zbieznosc-model-tabela">
                    <thead>
                      <tr>
                        <th>{T.modelKolTransformator}</th>
                        <th>{T.modelKolRegulacja}</th>
                        <th>{T.modelKolTryb}</th>
                        <th>{T.modelKolPozycja}</th>
                        <th>{T.modelKolZakres}</th>
                        <th>{T.modelKolKrok}</th>
                        <th>{WZORZEC_STRINGS.kolumnaDecyzja}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wierszeModelu.map((w) => (
                        <tr key={w.ref}>
                          <td>{w.nazwa}</td>
                          <td>{w.regulacja}</td>
                          <td>{w.tryb}</td>
                          <td className="mvd-num">{w.pozycja}</td>
                          <td className="mvd-num">{w.zakres}</td>
                          <td className="mvd-num">{w.krok}</td>
                          <td>
                            {/* F-K4: zaczepy to nastawa modelu, nie naruszenie kryterium —
                                akcja INSPEKCYJNA prowadzi do transformatora na schemacie. */}
                            <button
                              type="button"
                              className="mvd-zbieznosc-popraw"
                              data-testid="mvd-zbieznosc-popraw"
                              title={akcjaNaprawcza('inspekcja-elementu').opis}
                              onClick={() =>
                                poprawWModelu(w.ref, 'TransformerBranch', w.nazwa, 'inspekcja-elementu')
                              }
                            >
                              {akcjaNaprawcza('inspekcja-elementu').etykieta}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="mvd-zbieznosc-sekcja" aria-label={T.sladTytul}>
            <button
              type="button"
              className="mvd-zbieznosc-slad-przelacznik"
              data-testid="mvd-zbieznosc-slad-przelacznik"
              aria-expanded={sladRozwiniety}
              onClick={() => setSladRozwiniety((v) => !v)}
            >
              {sladRozwiniety ? T.sladUkryj : T.sladPokaz}
            </button>
            {sladRozwiniety && (
              !sladAktualny || sladAktualny.iterations.length === 0 ? (
                <p className="mvd-zbieznosc-nota" data-testid="mvd-zbieznosc-slad-brak">
                  {T.sladBrak}
                </p>
              ) : (
                <div className="mvd-zbieznosc-tabela-wrap">
                  <table className="mvd-zbieznosc-tabela" data-testid="mvd-zbieznosc-slad-tabela">
                    <thead>
                      <tr>
                        <th>{T.sladKolIteracja}</th>
                        <th>{T.sladKolNorma}</th>
                        <th>{T.sladKolMax}</th>
                        <th>{T.sladKolPrzyczyna}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {naWierszeIteracji(sladAktualny).map((w) => (
                        <tr key={w.k}>
                          <td className="mvd-num">{w.k}</td>
                          <td className="mvd-num">{w.norma}</td>
                          <td className="mvd-num">{w.maxNiezbilansowanie}</td>
                          <td>{w.przyczyna}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        </>
      )}

      <div className="mvd-zbieznosc-stopka">
        <span className="mvd-zbieznosc-lbl">{T.nastepnyEyebrow}</span>
        <p>{T.nastepnyOpis}</p>
        <div className="mvd-zbieznosc-stopka-akcje">
          <button
            type="button"
            className="mvd-zbieznosc-nastepny"
            data-testid="mvd-zbieznosc-otworz-rozplyw"
            onClick={() => otworzWyniki('rozplyw')}
          >
            {T.akcjaWynikiRozplywu}
          </button>
          <button
            type="button"
            className="mvd-zbieznosc-nastepny"
            data-testid="mvd-zbieznosc-otworz-oltc"
            onClick={() => otworzWyniki('regulacja-oltc')}
          >
            {T.akcjaBadaniaOltc}
          </button>
          <button
            type="button"
            className="mvd-zbieznosc-powrot"
            data-testid="mvd-zbieznosc-powrot"
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
