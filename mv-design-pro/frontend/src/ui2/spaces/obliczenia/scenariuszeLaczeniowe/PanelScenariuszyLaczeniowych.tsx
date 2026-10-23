/**
 * PanelScenariuszyLaczeniowych — „Scenariusze łączeniowe” w przestrzeni „Obliczenia”
 * (karta GPZ-H5-APARATURA, defekt koordynatora 5).
 *
 * PO CO. Stany łączeniowe projektu (utrata linii zasilającej 110 kV — SC-02, utrata
 * transformatora z zamknięciem łącznika sekcji SN — SC-03, przeniesienie punktu podziału)
 * mają w backendzie pełny tor: magazyn scenariuszy nazwanych (`OperatingScenario` —
 * `switch_states` i `out_of_service`), migawkę efektywną ADR-017 i bieg ze `scenario_id`.
 * Do tej karty żaden ekran nie zapisywał takiego scenariusza (zdolność bez wejścia).
 *
 * CO ROBI. Lista scenariuszy (nazwa, rewizja, zmiany nazwami elementów), zapis nowego
 * i nowej rewizji: położenie każdego łącznika modelu (jak w modelu / zamknięty / otwarty)
 * i wyłączenie elementu z eksploatacji (gałąź, transformator, źródło, wytwórca, odbiór,
 * bateria kondensatorów). Odmowa backendu (422 `{pole, komunikat}`) trafia do wiersza
 * elementu, który nazywa. Bieg ze scenariuszem: wybór „Stan łączeniowy” w „Uruchom
 * obliczenie” (ten sam magazyn listy). Zero fizyki, zero mutacji modelu.
 */

import { useEffect, useMemo, useState } from 'react';

import '../scenariusze/scenariusze.css';
import './scenariuszeLaczeniowe.css';
import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import {
  BladApiScenariuszaLaczeniowego,
  type BladPolaScenariuszaLaczeniowego,
  type ScenariuszLaczeniowy,
  type StanLacznika,
} from './api';
import { elementyScenariusza, nazwyElementow } from './elementyScenariusza';
import { useScenariuszeLaczenioweStore, useScenariuszeLaczeniowePrzypadku } from './store';
import { SCENARIUSZE_LACZENIOWE_STRINGS as T, STAN_LACZNIKA_PL } from './strings';

interface Formularz {
  scenarioId: string | null;
  nazwa: string;
  stany: Record<string, StanLacznika>;
  wylaczone: string[];
}

const PUSTY: Formularz = { scenarioId: null, nazwa: '', stany: {}, wylaczone: [] };

function opisZmian(s: ScenariuszLaczeniowy, nazwy: Map<string, string>): string {
  const nazwaElementu = (ref: string) => nazwy.get(ref) ?? T.brakWModelu(ref);
  const czesci = [
    ...Object.entries(s.switch_states)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([ref, stan]) => `${nazwaElementu(ref)}: ${STAN_LACZNIKA_PL[stan]}`),
    ...s.out_of_service.map((ref) => T.wylaczony(nazwaElementu(ref))),
  ];
  return czesci.length > 0 ? czesci.join('; ') : T.brakZmian;
}

function pasuje(filtr: string, nazwa: string, ref: string): boolean {
  const f = filtr.trim().toLocaleLowerCase('pl');
  return f === '' || nazwa.toLocaleLowerCase('pl').includes(f) || ref.toLocaleLowerCase('pl').includes(f);
}

export function PanelScenariuszyLaczeniowych() {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const model = useSnapshotStore((s) => s.snapshot);
  const wczytaj = useScenariuszeLaczenioweStore((s) => s.wczytaj);
  const zapisz = useScenariuszeLaczenioweStore((s) => s.zapisz);
  const ladowanie = useScenariuszeLaczenioweStore((s) => s.ladowanie);
  const bladListy = useScenariuszeLaczenioweStore((s) =>
    s.caseId === activeCaseId ? s.blad : null,
  );
  const scenariusze = useScenariuszeLaczeniowePrzypadku(activeCaseId);

  const [formularz, setFormularz] = useState<Formularz | null>(null);
  const [filtr, setFiltr] = useState('');
  const [bladFormularza, setBladFormularza] = useState<string | null>(null);
  const [bledyPol, setBledyPol] = useState<readonly BladPolaScenariuszaLaczeniowego[]>([]);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [zapisWToku, setZapisWToku] = useState(false);

  useEffect(() => {
    setFormularz(null);
    if (activeCaseId) void wczytaj(activeCaseId);
  }, [activeCaseId, wczytaj]);

  const elementy = useMemo(() => elementyScenariusza(model), [model]);
  const nazwy = useMemo(() => nazwyElementow(model), [model]);

  const otworz = (s: ScenariuszLaczeniowy | null) => {
    setFormularz(
      s === null
        ? PUSTY
        : {
            scenarioId: s.scenario_id,
            nazwa: s.name,
            stany: { ...s.switch_states },
            wylaczone: [...s.out_of_service],
          },
    );
    setFiltr('');
    setBladFormularza(null);
    setBledyPol([]);
    setKomunikat(null);
  };

  const bladPola = (pole: string): string | null =>
    bledyPol.find((b) => b.pole === pole)?.komunikat ?? null;

  const wyslij = async (f: Formularz) => {
    if (!activeCaseId) return;
    if (!f.nazwa.trim()) {
      setBladFormularza(T.brakNazwy);
      return;
    }
    setZapisWToku(true);
    setBladFormularza(null);
    setBledyPol([]);
    try {
      const zapisany = await zapisz(activeCaseId, {
        ...(f.scenarioId !== null ? { scenario_id: f.scenarioId } : {}),
        name: f.nazwa.trim(),
        switch_states: f.stany,
        out_of_service: f.wylaczone,
      });
      setFormularz(null);
      setKomunikat(T.zapisano(zapisany.name, zapisany.revision));
    } catch (error) {
      if (error instanceof BladApiScenariuszaLaczeniowego) setBledyPol(error.bledyPol);
      setBladFormularza(error instanceof Error ? error.message : String(error));
    } finally {
      setZapisWToku(false);
    }
  };

  const znaneLaczniki = new Set(elementy.laczniki.map((l) => l.ref));
  const znaneWylaczalne = new Set(elementy.grupy.flatMap((g) => g.elementy.map((e) => e.ref)));
  const nieznane = formularz
    ? [
        ...Object.keys(formularz.stany)
          .filter((ref) => !znaneLaczniki.has(ref))
          .map((ref) => ({ ref, pole: `switch_states.${ref}` })),
        ...formularz.wylaczone
          .filter((ref) => !znaneWylaczalne.has(ref))
          .map((ref) => ({ ref, pole: `out_of_service.${ref}` })),
      ].sort((a, b) => (a.pole < b.pole ? -1 : 1))
    : [];

  return (
    <section className="mvd-scen" data-testid="mvd-scen-laczeniowe" aria-label={T.tytul}>
      <div className="mvd-scen-glowa">
        <div>
          <h3 className="mvd-scen-tytul">{T.tytul}</h3>
          <p className="mvd-scen-cel">{T.cel}</p>
        </div>
        {activeCaseId && formularz === null && (
          <button
            type="button"
            className="mvd-scen-akcja"
            onClick={() => otworz(null)}
            data-testid="mvd-scen-laczeniowe-nowy"
          >
            {T.nowy}
          </button>
        )}
      </div>

      {!activeCaseId && (
        <p className="mvd-scen-uwaga" data-testid="mvd-scen-laczeniowe-brak-przypadku">
          {T.brakPrzypadku}
        </p>
      )}

      {activeCaseId && formularz !== null && (
        <form
          className="mvd-scen-formularz mvd-scen-formularz--laczeniowy"
          data-testid="mvd-scen-laczeniowe-formularz"
          onSubmit={(e) => {
            e.preventDefault();
            void wyslij(formularz);
          }}
        >
          <label className="mvd-scen-pole">
            <span>{T.poleNazwa}</span>
            <input
              type="text"
              value={formularz.nazwa}
              onChange={(e) => setFormularz({ ...formularz, nazwa: e.target.value })}
              data-testid="mvd-scen-laczeniowe-nazwa"
            />
          </label>
          {model === null && (
            <p className="mvd-scen-uwaga" data-testid="mvd-scen-laczeniowe-brak-modelu">
              {T.brakModelu}
            </p>
          )}
          <label className="mvd-scen-pole">
            <span>{T.poleFiltr}</span>
            <input
              type="search"
              value={filtr}
              onChange={(e) => setFiltr(e.target.value)}
              data-testid="mvd-scen-laczeniowe-filtr"
            />
          </label>

          {elementy.laczniki.length > 0 && (
            <fieldset className="mvd-scen-grupa" data-testid="mvd-scen-laczeniowe-laczniki">
              <legend>{T.sekcjaLaczniki}</legend>
              <p className="mvd-scen-cel">{T.sekcjaLacznikiOpis}</p>
              <table className="mvd-scen-tabela">
                <thead>
                  <tr>
                    <th scope="col">{T.kolLacznik}</th>
                    <th scope="col">{T.kolWModelu}</th>
                    <th scope="col">{T.kolWScenariuszu}</th>
                  </tr>
                </thead>
                <tbody>
                  {elementy.laczniki
                    .filter((l) => pasuje(filtr, l.nazwa, l.ref))
                    .map((l) => {
                      const blad = bladPola(`switch_states.${l.ref}`);
                      return (
                        <tr key={l.ref} data-testid={`mvd-scen-laczeniowe-lacznik-${l.ref}`}>
                          <td>{l.nazwa}</td>
                          <td>{STAN_LACZNIKA_PL[l.stanModelu]}</td>
                          <td>
                            <select
                              aria-label={`${T.kolWScenariuszu}: ${l.nazwa}`}
                              value={formularz.stany[l.ref] ?? ''}
                              onChange={(e) => {
                                const stany = { ...formularz.stany };
                                if (e.target.value === '') delete stany[l.ref];
                                else stany[l.ref] = e.target.value as StanLacznika;
                                setFormularz({ ...formularz, stany });
                              }}
                              data-testid={`mvd-scen-laczeniowe-stan-${l.ref}`}
                            >
                              <option value="">{T.jakWModelu(l.stanModelu)}</option>
                              <option value="closed">{STAN_LACZNIKA_PL.closed}</option>
                              <option value="open">{STAN_LACZNIKA_PL.open}</option>
                            </select>
                            {blad && (
                              <p
                                className="mvd-scen-blad"
                                data-testid={`mvd-scen-laczeniowe-blad-switch_states.${l.ref}`}
                              >
                                {blad}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </fieldset>
          )}

          {elementy.grupy.length > 0 && (
            <fieldset className="mvd-scen-grupa" data-testid="mvd-scen-laczeniowe-wylaczenia">
              <legend>{T.sekcjaWylaczenia}</legend>
              <p className="mvd-scen-cel">{T.sekcjaWylaczeniaOpis}</p>
              {elementy.grupy.map((g) => {
                const widoczne = g.elementy.filter((e) => pasuje(filtr, e.nazwa, e.ref));
                if (widoczne.length === 0) return null;
                return (
                  <div key={g.kolekcja} data-testid={`mvd-scen-laczeniowe-grupa-${g.kolekcja}`}>
                    <p className="mvd-scen-uwaga">{g.etykieta}</p>
                    {widoczne.map((e) => {
                      const blad = bladPola(`out_of_service.${e.ref}`);
                      return (
                        <div key={e.ref}>
                          <label className="mvd-scen-pole mvd-scen-pole--chk">
                            <input
                              type="checkbox"
                              checked={formularz.wylaczone.includes(e.ref)}
                              onChange={(zdarzenie) =>
                                setFormularz({
                                  ...formularz,
                                  wylaczone: zdarzenie.target.checked
                                    ? [...formularz.wylaczone, e.ref]
                                    : formularz.wylaczone.filter((r) => r !== e.ref),
                                })
                              }
                              data-testid={`mvd-scen-laczeniowe-wylacz-${e.ref}`}
                            />
                            <span>{e.nazwa}</span>
                          </label>
                          {blad && (
                            <p
                              className="mvd-scen-blad"
                              data-testid={`mvd-scen-laczeniowe-blad-out_of_service.${e.ref}`}
                            >
                              {blad}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </fieldset>
          )}

          {nieznane.length > 0 && (
            <fieldset className="mvd-scen-grupa" data-testid="mvd-scen-laczeniowe-nieznane">
              <legend>{T.sekcjaNieznane}</legend>
              <p className="mvd-scen-cel">{T.sekcjaNieznaneOpis}</p>
              {nieznane.map(({ ref, pole }) => (
                <div key={pole} data-testid={`mvd-scen-laczeniowe-nieznany-${pole}`}>
                  <span>
                    {pole.startsWith('out_of_service.')
                      ? T.wylaczony(T.brakWModelu(ref))
                      : `${T.brakWModelu(ref)}: ${STAN_LACZNIKA_PL[formularz.stany[ref]]}`}
                  </span>{' '}
                  <button
                    type="button"
                    className="mvd-scen-akcja mvd-scen-akcja--wtorna"
                    onClick={() => {
                      const stany = { ...formularz.stany };
                      if (pole.startsWith('switch_states.')) delete stany[ref];
                      setFormularz({
                        ...formularz,
                        stany,
                        wylaczone: pole.startsWith('out_of_service.')
                          ? formularz.wylaczone.filter((r) => r !== ref)
                          : formularz.wylaczone,
                      });
                    }}
                    data-testid={`mvd-scen-laczeniowe-usun-${pole}`}
                  >
                    {T.usunWpis}
                  </button>
                  {bladPola(pole) && (
                    <p className="mvd-scen-blad" data-testid={`mvd-scen-laczeniowe-blad-${pole}`}>
                      {bladPola(pole)}
                    </p>
                  )}
                </div>
              ))}
            </fieldset>
          )}

          {bladFormularza && (
            <p className="mvd-scen-blad" data-testid="mvd-scen-laczeniowe-blad-formularza">
              {bladFormularza}
            </p>
          )}
          <div className="mvd-scen-glowa">
            <button
              type="submit"
              className="mvd-scen-akcja"
              disabled={zapisWToku}
              data-testid="mvd-scen-laczeniowe-zapisz"
            >
              {T.zapisz}
            </button>
            <button
              type="button"
              className="mvd-scen-akcja mvd-scen-akcja--wtorna"
              onClick={() => setFormularz(null)}
              data-testid="mvd-scen-laczeniowe-anuluj"
            >
              {T.anuluj}
            </button>
          </div>
        </form>
      )}

      {komunikat && (
        <p className="mvd-scen-ok" data-testid="mvd-scen-laczeniowe-komunikat">
          {komunikat}
        </p>
      )}
      {bladListy && (
        <p className="mvd-scen-blad" data-testid="mvd-scen-laczeniowe-blad-listy">
          {bladListy}
        </p>
      )}
      {activeCaseId && ladowanie && scenariusze.length === 0 && (
        <p className="mvd-scen-uwaga" data-testid="mvd-scen-laczeniowe-ladowanie">
          {T.ladowanie}
        </p>
      )}
      {activeCaseId && !ladowanie && !bladListy && scenariusze.length === 0 && (
        <div className="mvd-scen-pusty" data-testid="mvd-scen-laczeniowe-pusty">
          <p>{T.brakScenariuszy}</p>
        </div>
      )}
      {scenariusze.length > 0 && (
        <table className="mvd-scen-tabela" data-testid="mvd-scen-laczeniowe-tabela">
          <thead>
            <tr>
              <th scope="col">{T.kolNazwa}</th>
              <th scope="col">{T.kolRewizja}</th>
              <th scope="col">{T.kolZmiany}</th>
              <th scope="col">{T.kolAkcje}</th>
            </tr>
          </thead>
          <tbody>
            {scenariusze.map((s) => (
              <tr key={s.scenario_id} data-testid={`mvd-scen-laczeniowe-wiersz-${s.scenario_id}`}>
                <td>{s.name}</td>
                <td className="mvd-num">{s.revision}</td>
                <td data-testid={`mvd-scen-laczeniowe-zmiany-${s.scenario_id}`}>
                  {opisZmian(s, nazwy)}
                </td>
                <td>
                  <button
                    type="button"
                    className="mvd-scen-akcja"
                    onClick={() => otworz(s)}
                    data-testid={`mvd-scen-laczeniowe-edytuj-${s.scenario_id}`}
                  >
                    {T.edytuj}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
