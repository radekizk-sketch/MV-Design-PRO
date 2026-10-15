/**
 * EkranZabezpieczenAutomatyki — realny dostawca ui2 dla ekranu kanonicznego E-27
 * („Zabezpieczenia i automatyka", karta E-27, FLOW §0.3 „kontrakt ekranu
 * prowadzącego"). Kończy phantom: E-27 miał tymczasowo dostawcę kontraktu analizy
 * (F-E5b), teraz dostaje własny ekran przeglądowy oparty na REALNYM read-modelu pola.
 *
 * Rama prowadząca:
 *  - nagłówek: eyebrow obszaru + JEDNO zdanie celu inżynierskiego (§0.3),
 *  - stan wejścia: brak projektu / brak pól w modelu → uczciwy stan zerowy z akcją
 *    prowadzącą we właściwą przestrzeń (`useShellStore.setActiveSpace`), NIE pusta tabela,
 *  - sekcja ZABEZPIECZENIA: tabela pól z przypisaniami zabezpieczeń (ENM) + akcja
 *    wiersza „Otwórz kartę pola" → istniejący panel E-11 `field_protection`
 *    (`networkBuildStore.openInspectorPanel`),
 *  - sekcja AUTOMATYKA: tabela sterowników polowych (`BayProtectionControlUnit`) —
 *    chipy funkcji z `automation_features` i stan SPZ; braki jako „nie skonfigurowano",
 *  - sekcja NASTAWY (karta BIEG-ZABEZPIECZEN-Z-MODELU, D-21): edytor nastaw I>/I>> każdego
 *    zabezpieczenia nadprądowego modelu (pola i wyłączniki liniowe) — operacja
 *    `update_protection_settings`, dane rozwiązane z read modelu `protection-view`,
 *  - następny krok: koordynacja zabezpieczeń (E-28, `openRouteSurface('E-28')`).
 *
 * ZERO fizyki, ZERO mutacji modelu, ZERO fabrykacji — dane wyłącznie z
 * `useFieldReadModel`. Edycja automatyki NIE ma operacji domenowej zapisu w kanonie
 * operacji (`domain/canonical_operations.py` — brak set_spz/szr/automation), więc
 * ścieżka edycji prowadzi do istniejących paneli pola E-11 (realna ścieżka dziś).
 * Stylowanie wyłącznie tokenami --mvd-* (oba motywy z automatu).
 */

import './zabezpieczenia-automatyka.css';

import { useAppStateStore } from '../../../ui/app-state';
import { useFieldReadModel } from '../../../ui/field/useFieldReadModel';
import { useProtectionView } from '../../../ui/protection';
import { urzadzeniaZNastawami } from '../../../ui/protection/protection-view';
import { EdytorNastawZabezpieczenia } from '../../kreatory/przekaznik';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useShellStore } from '../../shell/useShellStore';
import {
  buildSterowniki,
  buildWierszeZabezpieczen,
  type Sterownik,
} from './model';
import { ZABEZPIECZENIA_STRINGS as T } from './strings';

function StanZerowy({
  tytul,
  opis,
  akcja,
  onAkcja,
  testid,
}: {
  tytul: string;
  opis: string;
  akcja: string;
  onAkcja: () => void;
  testid: string;
}) {
  return (
    <div className="mvd-za-stan" data-testid={testid} data-tone="idle">
      <h3>{tytul}</h3>
      <p>{opis}</p>
      <button
        type="button"
        className="mvd-za-akcja"
        data-testid={`${testid}-akcja`}
        onClick={onAkcja}
      >
        {akcja}
      </button>
    </div>
  );
}

/** Sekcja edytorów nastaw — wszystkie zabezpieczenia nadprądowe modelu (read model). */
function SekcjaNastaw() {
  const widok = useProtectionView();
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const urzadzenia = urzadzeniaZNastawami(widok.data);
  const wylaczniki = widok.data.wylaczniki_liniowe ?? [];
  return (
    <section className="mvd-za-sekcja" data-testid="mvd-za-nastawy">
      <h4>{T.nastawyTytul}</h4>
      <p className="mvd-za-sekcja-opis">{T.nastawyOpis}</p>
      {wylaczniki.length > 0 ? (
        <div className="mvd-za-tabela-scroll" data-testid="mvd-za-wylaczniki">
          <h5>{T.wylacznikiTytul}</h5>
          <p className="mvd-za-sekcja-opis">{T.wylacznikiOpis}</p>
          <table className="mvd-za-tabela">
            <tbody>
              {wylaczniki.map((w) => (
                <tr key={w.ref_id} data-testid={`mvd-za-wylacznik-${w.ref_id}`}>
                  <td>{w.nazwa ?? T.wylacznikBezNazwy}</td>
                  <td>{T.wylacznikStanCt(w.przekladniki.length)}</td>
                  <td>{T.wylacznikStanZab(w.zabezpieczenia.length)}</td>
                  <td>
                    {w.przekladniki.length === 0 ? (
                      <button
                        type="button"
                        className="mvd-za-wiersz-akcja"
                        data-testid={`mvd-za-dodaj-ct-${w.ref_id}`}
                        onClick={() =>
                          openOperationForm('add_ct', { kotwica: 'wylacznik', breaker_ref: w.ref_id })
                        }
                      >
                        {T.dodajPrzekladnik}
                      </button>
                    ) : w.zabezpieczenia.length === 0 ? (
                      <button
                        type="button"
                        className="mvd-za-wiersz-akcja"
                        data-testid={`mvd-za-dodaj-zabezpieczenie-${w.ref_id}`}
                        onClick={() =>
                          openOperationForm('add_relay', {
                            kotwica: 'wylacznik',
                            breaker_ref: w.ref_id,
                          })
                        }
                      >
                        {T.dodajZabezpieczenie}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {widok.error ? (
        <p className="mvd-za-pusto" role="alert" data-testid="mvd-za-nastawy-blad">
          {T.nastawyBlad}: {widok.error}
        </p>
      ) : widok.isLoading && urzadzenia.length === 0 ? (
        <p className="mvd-za-pusto" data-testid="mvd-za-nastawy-ladowanie">
          {T.nastawyLadowanie}
        </p>
      ) : urzadzenia.length === 0 ? (
        <p className="mvd-za-pusto" data-testid="mvd-za-nastawy-brak">
          {T.nastawyBrak}
        </p>
      ) : (
        <div className="mvd-za-sterowniki">
          {urzadzenia.map((wpis) =>
            wpis.nastawy ? (
              <EdytorNastawZabezpieczenia
                key={wpis.device_id}
                urzadzenieRef={wpis.device_id}
                nastawy={wpis.nastawy}
                slownik={widok.data.slownik_nastaw}
                testid={`mvd-za-edytor-${wpis.device_id}`}
              />
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}

function SterownikKarta({ sterownik }: { sterownik: Sterownik }) {
  const { spz } = sterownik;
  return (
    <div className="mvd-za-sterownik" data-testid={`mvd-za-sterownik-${sterownik.bayRef}`}>
      <div className="mvd-za-sterownik-head">
        <span className="mvd-za-sterownik-nazwa">{sterownik.bayName}</span>
        {sterownik.urzadzenie ? (
          <span className="mvd-za-sterownik-urzadzenie">{sterownik.urzadzenie}</span>
        ) : null}
      </div>

      <div className="mvd-za-blok">
        <h5>{T.cechyTytul}</h5>
        <div className="mvd-za-chipy" data-testid={`mvd-za-cechy-${sterownik.bayRef}`}>
          {sterownik.cechy.map((cecha) => (
            <span
              key={cecha.klucz}
              className="mvd-za-chip"
              data-aktywna={cecha.aktywna ? 'true' : 'false'}
              data-testid={`mvd-za-cecha-${sterownik.bayRef}-${cecha.klucz}`}
            >
              {cecha.etykieta}: {cecha.aktywna ? T.cechaWl : T.cechaWyl}
            </span>
          ))}
        </div>
      </div>

      <div className="mvd-za-blok">
        <h5>{T.spzTytul}</h5>
        {spz === null ? (
          <span
            className="mvd-za-chip"
            data-aktywna="false"
            data-testid={`mvd-za-spz-brak-${sterownik.bayRef}`}
          >
            {T.spzNieSkonfigurowano}
          </span>
        ) : (
          <dl className="mvd-za-spz" data-testid={`mvd-za-spz-${sterownik.bayRef}`}>
            <div>
              <dt>{T.spzStan}</dt>
              <dd>{spz.aktywny ? T.spzAktywny : T.spzOdstawiony} ({spz.stanEtykieta})</dd>
            </div>
            <div>
              <dt>{T.spzProbySzybkie}</dt>
              <dd>{spz.probySzybkie}</dd>
            </div>
            <div>
              <dt>{T.spzProbyWolne}</dt>
              <dd>{spz.probyWolne}</dd>
            </div>
            {spz.zablokowany ? (
              <div>
                <dt>{T.spzBlokada}</dt>
                <dd>{spz.powodBlokady ?? '—'}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>
    </div>
  );
}

export function EkranZabezpieczenAutomatyki() {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const openInspectorPanel = useNetworkBuildStore((s) => s.openInspectorPanel);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const { data } = useFieldReadModel();

  const wiersze = buildWierszeZabezpieczen(data.fields);
  const sterowniki = buildSterowniki(data.fields);

  return (
    <div className="mvd-za" data-testid="mvd-za">
      <header className="mvd-za-head">
        <span className="mvd-za-lbl">{T.eyebrow}</span>
        <p className="mvd-za-cel">{T.cel}</p>
      </header>

      {!activeProjectId ? (
        <StanZerowy
          tytul={T.brakProjektuTytul}
          opis={T.brakProjektuOpis}
          akcja={T.brakProjektuAkcja}
          onAkcja={() => setActiveSpace('projekt')}
          testid="mvd-za-brak-projektu"
        />
      ) : wiersze.length === 0 ? (
        <>
          <StanZerowy
            tytul={T.brakPolTytul}
            opis={T.brakPolOpis}
            akcja={T.brakPolAkcja}
            onAkcja={() => setActiveSpace('model')}
            testid="mvd-za-brak-pol"
          />
          {/* Zabezpieczenia przy wyłącznikach liniowych istnieją także bez pól rozdzielni. */}
          <SekcjaNastaw />
        </>
      ) : (
        <>
          <section className="mvd-za-sekcja" data-testid="mvd-za-zabezpieczenia">
            <h4>{T.zabezpieczeniaTytul}</h4>
            <p className="mvd-za-sekcja-opis">{T.zabezpieczeniaOpis}</p>
            <div className="mvd-za-tabela-scroll">
              <table className="mvd-za-tabela">
                <thead>
                  <tr>
                    <th>{T.kolPole}</th>
                    <th>{T.kolUrzadzenie}</th>
                    <th>{T.kolSzablon}</th>
                    <th>{T.kolFunkcje}</th>
                    <th>{T.kolAkcja}</th>
                  </tr>
                </thead>
                <tbody>
                  {wiersze.map((wiersz) => (
                    <tr key={wiersz.bayRef} data-testid={`mvd-za-wiersz-${wiersz.bayRef}`}>
                      <td>{wiersz.bayName}</td>
                      <td>
                        {wiersz.urzadzenie ? (
                          wiersz.urzadzenie
                        ) : (
                          <span
                            className="mvd-za-chip"
                            data-aktywna="false"
                            data-testid={`mvd-za-bez-zabezpieczenia-${wiersz.bayRef}`}
                          >
                            {T.spzNieSkonfigurowano}
                          </span>
                        )}
                      </td>
                      <td data-testid={`mvd-za-szablon-${wiersz.bayRef}`}>
                        {wiersz.szablon
                          ? `${wiersz.szablon}${wiersz.rodzina ? ` · ${wiersz.rodzina}` : ''}`
                          : T.szablonBrak}
                      </td>
                      <td>{wiersz.funkcje.length > 0 ? wiersz.funkcje.join(', ') : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="mvd-za-wiersz-akcja"
                          title={T.otworzKartePolaOpis}
                          data-testid={`mvd-za-otworz-pole-${wiersz.bayRef}`}
                          onClick={() =>
                            openInspectorPanel('field_protection', wiersz.bayRef, 'BaySN')
                          }
                        >
                          {T.otworzKartePola}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <SekcjaNastaw />

          <section className="mvd-za-sekcja" data-testid="mvd-za-automatyka">
            <h4>{T.automatykaTytul}</h4>
            <p className="mvd-za-sekcja-opis">{T.automatykaOpis}</p>
            {sterowniki.length === 0 ? (
              <p className="mvd-za-pusto" data-testid="mvd-za-brak-sterownikow">
                {T.brakSterownikow}
              </p>
            ) : (
              <div className="mvd-za-sterowniki">
                {sterowniki.map((sterownik) => (
                  <SterownikKarta key={sterownik.bayRef} sterownik={sterownik} />
                ))}
              </div>
            )}
          </section>

          <div className="mvd-za-stopka">
            <span className="mvd-za-lbl">{T.nastepnyEyebrow}</span>
            <p>{T.nastepnyOpis}</p>
            <button
              type="button"
              className="mvd-za-nastepny"
              title={T.nastepnyAkcjaOpis}
              data-testid="mvd-za-nastepny"
              onClick={() => openRouteSurface('E-28')}
            >
              {T.nastepnyAkcja}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
