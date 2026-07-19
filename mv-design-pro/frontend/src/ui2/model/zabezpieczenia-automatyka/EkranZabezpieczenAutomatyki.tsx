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
 *    (`networkBuildStore.openInspectorPanel`, ta sama akcja, której używa BayCard),
 *  - sekcja AUTOMATYKA: tabela sterowników polowych (`BayProtectionControlUnit`) —
 *    chipy funkcji z `automation_features` i stan SPZ; braki jako „nie skonfigurowano",
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
        <StanZerowy
          tytul={T.brakPolTytul}
          opis={T.brakPolOpis}
          akcja={T.brakPolAkcja}
          onAkcja={() => setActiveSpace('model')}
          testid="mvd-za-brak-pol"
        />
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
