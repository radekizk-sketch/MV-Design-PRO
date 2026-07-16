/*
 * „Macierz wymogów NC RfG per moduł" (karta P39 / rejestr W-614).
 *
 * Interaktywna macierz zgodności PTPiREE dla WSZYSTKICH modułów wytwórczych
 * projektu naraz: wiersze = wymogi/testy z katalogu procedury, kolumny = moduły
 * (PV/BESS/FW), komórka = werdykt z odpowiedzi solvera. Podsumowanie per moduł
 * i per projekt.
 *
 * Granice (NOT-A-SOLVER / Single Model): warstwa tylko prezentuje. Werdykty
 * pochodzą WYŁĄCZNIE z `NcRfgRunResult`; dane DER czytane read-only ze store'a
 * (`useStationDerStore`), zdolności edytowane w stanie lokalnym okna (zero
 * mutacji modelu). Bieg uruchamiany jawnym przyciskiem. Klient API reużyty
 * z `ui/ncrfg-tests/api` — bez własnego klienta.
 */

import { useEffect, useMemo, useState } from 'react';

import { type NcRfgVerdict } from '../../../ui/ncrfg-tests/api';
import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { useNcRfgStore } from '../ncRfgStore';
import { PanelModulu } from './PanelModulu';
import { SzczegolWerdyktu } from './SzczegolWerdyktu';
import {
  mapujMacierz,
  podsumowanieModulu,
  podsumowanieProjektu,
  zbudujModuly,
  zbudujWejscieModulu,
  type KluczNumeryczny,
  type KluczZdolnosci,
  type KomorkaMacierzy,
  type NumeryczneModulu,
  type OpisModulu,
  type PochodzenieDanej,
  type ZdolnosciModulu,
} from './macierzModel';
import {
  ETYKIETY_STATUSU_MODULU,
  ETYKIETY_WERDYKTU,
  KLASA_WERDYKTU,
  MACIERZ_STRINGS,
  formatMoc,
  formatNapiecie,
} from './strings';

import './macierz.css';

interface EdycjaModulu {
  readonly zdolnosci: ZdolnosciModulu;
  readonly pochodzenie: Record<KluczZdolnosci, PochodzenieDanej>;
  readonly numeryczne: NumeryczneModulu;
}

const LEGENDA: readonly NcRfgVerdict[] = ['pass', 'fail', 'no_data', 'not_required'];

export interface MacierzNcRfgProps {
  /** Tryb zaawansowania — odcisk deterministyczny widoczny w trybie eksperckim. */
  readonly trybZaawansowania: AdvancementMode;
}

export function MacierzNcRfg({ trybZaawansowania }: MacierzNcRfgProps): JSX.Element {
  const ders = useStationDerStore((state) => selectAllDers(state));
  const opisyBazowe = useMemo(() => zbudujModuly(ders), [ders]);

  // Stan biegu NC RfG — wspólny store (widoczny również w pulpicie instalacji OZE).
  const katalog = useNcRfgStore((s) => s.katalog);
  const bladKatalogu = useNcRfgStore((s) => s.bladKatalogu);
  const operatorId = useNcRfgStore((s) => s.operatorId);
  const status = useNcRfgStore((s) => s.status);
  const wynik = useNcRfgStore((s) => s.wynik);
  const bladBiegu = useNcRfgStore((s) => s.bladBiegu);
  const zaladujKatalog = useNcRfgStore((s) => s.zaladujKatalog);
  const ustawOperator = useNcRfgStore((s) => s.ustawOperator);
  const przeprowadzTesty = useNcRfgStore((s) => s.przeprowadzTesty);

  const [edycje, setEdycje] = useState<Record<string, EdycjaModulu>>({});
  const [wybranaKomorka, setWybranaKomorka] = useState<{ derRef: string; testId: string } | null>(
    null,
  );
  const [wybranyModul, setWybranyModul] = useState<string>('');

  // Katalog wymogów — pobranie jednorazowe do wspólnego store'a.
  useEffect(() => {
    void zaladujKatalog();
  }, [zaladujKatalog]);

  // Domyślny wybór modułu do panelu.
  useEffect(() => {
    if (!wybranyModul && opisyBazowe[0]) setWybranyModul(opisyBazowe[0].derRef);
  }, [opisyBazowe, wybranyModul]);

  // Efektywne opisy = bazowe z modelu + edycje lokalne okna (zero mutacji modelu).
  const opisy = useMemo<OpisModulu[]>(
    () =>
      opisyBazowe.map((opis) => {
        const edycja = edycje[opis.derRef];
        if (!edycja) return opis;
        return {
          ...opis,
          zdolnosci: edycja.zdolnosci,
          pochodzenieZdolnosci: edycja.pochodzenie,
          numeryczne: edycja.numeryczne,
        };
      }),
    [opisyBazowe, edycje],
  );

  const opisWybrany = opisy.find((o) => o.derRef === wybranyModul) ?? opisy[0] ?? null;

  const wiersze = useMemo(
    () => mapujMacierz(katalog, wynik, opisy),
    [katalog, wynik, opisy],
  );
  const podsumProjektu = useMemo(() => podsumowanieProjektu(opisy, wynik), [opisy, wynik]);

  const gotoweDoBiegu = opisy.filter((o) => o.powodBlokady === null);
  const powodBlokadyBiegu =
    opisy.length === 0
      ? MACIERZ_STRINGS.brakModulow
      : gotoweDoBiegu.length === 0
        ? MACIERZ_STRINGS.brakModulowOpis
        : status === 'running'
          ? MACIERZ_STRINGS.wTrakcie
          : null;

  const zmienZdolnosc = (derRef: string, klucz: KluczZdolnosci, wartosc: boolean): void => {
    const opis = opisy.find((o) => o.derRef === derRef);
    if (!opis) return;
    setEdycje((current) => {
      const poprzednia: EdycjaModulu = current[derRef] ?? {
        zdolnosci: opis.zdolnosci,
        pochodzenie: { ...opis.pochodzenieZdolnosci },
        numeryczne: opis.numeryczne,
      };
      return {
        ...current,
        [derRef]: {
          ...poprzednia,
          zdolnosci: { ...poprzednia.zdolnosci, [klucz]: wartosc },
          pochodzenie: { ...poprzednia.pochodzenie, [klucz]: 'deklarowane' },
        },
      };
    });
  };

  const zmienParametr = (derRef: string, klucz: KluczNumeryczny, wartosc: string): void => {
    const opis = opisy.find((o) => o.derRef === derRef);
    if (!opis) return;
    setEdycje((current) => {
      const poprzednia: EdycjaModulu = current[derRef] ?? {
        zdolnosci: opis.zdolnosci,
        pochodzenie: { ...opis.pochodzenieZdolnosci },
        numeryczne: opis.numeryczne,
      };
      return {
        ...current,
        [derRef]: {
          ...poprzednia,
          numeryczne: { ...poprzednia.numeryczne, [klucz]: wartosc },
        },
      };
    });
  };

  const przeprowadz = async (): Promise<void> => {
    const wejscia = gotoweDoBiegu
      .map((opis) => zbudujWejscieModulu(opis, operatorId))
      .filter((m): m is NonNullable<typeof m> => m !== null);
    await przeprowadzTesty(wejscia, katalog?.procedure_version);
  };

  const komorkaSzczegolu: KomorkaMacierzy | null = wybranaKomorka
    ? (wiersze
        .find((w) => w.test.test_id === wybranaKomorka.testId)
        ?.komorki.find((k) => k.derRef === wybranaKomorka.derRef) ?? null)
    : null;
  const nazwaModuluSzczegolu =
    opisy.find((o) => o.derRef === wybranaKomorka?.derRef)?.nazwa ?? null;

  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  return (
    <div className="mvd-oze" data-testid="mvd-oze-macierz-ncrfg">
      <header className="mvd-oze-head">
        <div className="mvd-oze-head-main">
          <h3 className="mvd-oze-title">{MACIERZ_STRINGS.tytul}</h3>
          <p className="mvd-oze-sub">{MACIERZ_STRINGS.podtytul}</p>
        </div>
        <div className="mvd-oze-head-akcje">
          <div className="mvd-oze-pola">
            <label className="mvd-oze-pole">
              <span>{MACIERZ_STRINGS.operator}</span>
              <select
                value={operatorId}
                onChange={(event) => ustawOperator(event.target.value)}
                data-testid="mvd-oze-operator"
              >
                {(katalog?.operators ?? [{ operator_id: 'enea', operator_name_pl: 'Enea Operator', last_revision: '' }]).map(
                  (op) => (
                    <option key={op.operator_id} value={op.operator_id}>
                      {op.operator_name_pl}
                    </option>
                  ),
                )}
              </select>
            </label>
            {katalog ? (
              <div className="mvd-oze-pole">
                <span>{MACIERZ_STRINGS.wersjaProcedury}</span>
                <span>{katalog.procedure_version}</span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="mvd-btn mvd-btn-glowny"
            onClick={() => void przeprowadz()}
            disabled={Boolean(powodBlokadyBiegu)}
            title={powodBlokadyBiegu ?? MACIERZ_STRINGS.przeprowadz}
            data-testid="mvd-oze-przeprowadz"
          >
            {status === 'running' ? MACIERZ_STRINGS.wTrakcie : MACIERZ_STRINGS.przeprowadz}
          </button>
          {trybEkspercki && wynik ? (
            <div className="mvd-oze-odcisk" data-testid="mvd-oze-odcisk">
              {MACIERZ_STRINGS.odcisk}: {wynik.deterministic_hash}
            </div>
          ) : null}
        </div>
      </header>

      {bladKatalogu ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-blad-katalogu">
          {MACIERZ_STRINGS.bladKatalogu}: {bladKatalogu}
        </div>
      ) : null}
      {bladBiegu ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-blad-biegu">
          {MACIERZ_STRINGS.bladBiegu}: {bladBiegu}
        </div>
      ) : null}

      {opisy.length === 0 ? (
        <section className="mvd-oze-info" data-testid="mvd-oze-pusty">
          <h4>{MACIERZ_STRINGS.brakModulow}</h4>
          <p>{MACIERZ_STRINGS.brakModulowOpis}</p>
        </section>
      ) : (
        <div className="mvd-oze-uklad">
          <div className="mvd-oze-macierz-wrap" data-testid="mvd-oze-macierz-tabela">
            <table className="mvd-oze-macierz">
              <thead>
                <tr>
                  <th className="mvd-oze-col-test">{MACIERZ_STRINGS.naglowekTestu}</th>
                  {opisy.map((opis) => (
                    <th key={opis.derRef} className="mvd-oze-modul-h">
                      <button
                        type="button"
                        className="mvd-oze-komorka"
                        onClick={() => {
                          setWybranyModul(opis.derRef);
                          setWybranaKomorka(null);
                        }}
                        aria-pressed={wybranyModul === opis.derRef}
                        data-testid={`mvd-oze-modul-${opis.derRef}`}
                      >
                        <span className="mvd-oze-modul-nazwa">
                          {opis.nazwa} · {opis.rodzaj}
                        </span>
                      </button>
                      <div className="mvd-oze-modul-meta mvd-oze-num">
                        {formatMoc(opis.mocKw)} · {formatNapiecie(opis.napiecieKv)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wiersze.length === 0 ? (
                  <tr>
                    <td colSpan={opisy.length + 1} className="mvd-oze-komorka-pusta">
                      {MACIERZ_STRINGS.brakBieguOpis}
                    </td>
                  </tr>
                ) : (
                  wiersze.map((wiersz) => (
                    <tr key={wiersz.test.test_id} data-testid="mvd-oze-wiersz">
                      <td className="mvd-oze-col-test">
                        <div className="mvd-oze-test-nazwa">{wiersz.test.ability_pl}</div>
                        <div className="mvd-oze-test-podstawa">{wiersz.test.procedure_basis_pl}</div>
                      </td>
                      {wiersz.komorki.map((komorka) => (
                        <td key={komorka.derRef}>
                          {komorka.stan === 'wynik' && komorka.werdykt ? (
                            <button
                              type="button"
                              className={`mvd-oze-komorka ${KLASA_WERDYKTU[komorka.werdykt]}`}
                              onClick={() =>
                                setWybranaKomorka({
                                  derRef: komorka.derRef,
                                  testId: komorka.testId,
                                })
                              }
                              aria-pressed={
                                wybranaKomorka?.derRef === komorka.derRef &&
                                wybranaKomorka?.testId === komorka.testId
                              }
                              data-testid="mvd-oze-komorka-wynik"
                            >
                              {ETYKIETY_WERDYKTU[komorka.werdykt]}
                            </button>
                          ) : komorka.stan === 'brak_danych_modul' ? (
                            <button
                              type="button"
                              className="mvd-oze-komorka mvd-oze-werdykt-warn"
                              onClick={() =>
                                setWybranaKomorka({
                                  derRef: komorka.derRef,
                                  testId: komorka.testId,
                                })
                              }
                              data-testid="mvd-oze-komorka-brak-danych"
                            >
                              {ETYKIETY_WERDYKTU.no_data}
                            </button>
                          ) : (
                            <span
                              className="mvd-oze-komorka-pusta"
                              data-testid="mvd-oze-komorka-brak-biegu"
                            >
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mvd-oze-legenda" data-testid="mvd-oze-legenda">
              <span>{MACIERZ_STRINGS.legenda}:</span>
              {LEGENDA.map((werdykt) => (
                <span key={werdykt} className="mvd-oze-legenda-poz">
                  <span className={`mvd-oze-legenda-znak ${KLASA_WERDYKTU[werdykt]}`} />
                  {ETYKIETY_WERDYKTU[werdykt]}
                </span>
              ))}
            </div>

            <div className="mvd-oze-podsum" data-testid="mvd-oze-podsum-projektu">
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduly}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.liczbaModulow}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleZgodne}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.zgodne}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleNiezgodne}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.niezgodne}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleBrakDanych}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">{podsumProjektu.brakDanych}</span>
              </div>
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.wymogiSpelnione}</span>
                <span className="mvd-oze-podsum-wart mvd-oze-num">
                  {podsumProjektu.spelnioneRazem} / {podsumProjektu.wymaganeRazem}
                </span>
              </div>
            </div>

            <div className="mvd-oze-podsum" data-testid="mvd-oze-podsum-moduly">
              {opisy.map((opis) => {
                const p = podsumowanieModulu(opis, wynik);
                return (
                  <div key={opis.derRef} className="mvd-oze-podsum-poz">
                    <span className="mvd-oze-podsum-etyk">
                      {opis.nazwa} · {ETYKIETY_STATUSU_MODULU[p.overallStatus] ?? p.overallStatus}
                    </span>
                    <span className="mvd-oze-podsum-wart mvd-oze-num">
                      {p.passCount} / {p.requiredCount}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SzczegolWerdyktu
              komorka={komorkaSzczegolu}
              nazwaModulu={nazwaModuluSzczegolu}
              slad={wynik?.white_box_trace ?? []}
            />
            {opisWybrany ? (
              <PanelModulu
                opis={opisWybrany}
                zdolnosci={opisWybrany.zdolnosci}
                pochodzenie={opisWybrany.pochodzenieZdolnosci}
                numeryczne={opisWybrany.numeryczne}
                onZmienZdolnosc={(klucz, wartosc) =>
                  zmienZdolnosc(opisWybrany.derRef, klucz, wartosc)
                }
                onZmienParametr={(klucz, wartosc) =>
                  zmienParametr(opisWybrany.derRef, klucz, wartosc)
                }
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
