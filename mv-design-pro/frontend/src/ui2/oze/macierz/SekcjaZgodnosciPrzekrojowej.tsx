/*
 * Sekcja „Zgodność przekrojowa przypadku" (karta S-3, 2026-09-16 — „jeden tor
 * NC RfG"; dawniej W3-D) — obok macierzy per DER (`MacierzNcRfg`). Czyta
 * `GET /api/ncrfg-tests/cases/{case_id}/compliance`: zgodność WSZYSTKICH źródeł
 * przekształtnikowych modelu naraz, liczona NA ŻYWO z committed ENM TYM SAMYM
 * solverem, co bieg macierzy — bez ręcznego kompletowania zdolności modułu.
 *
 * Granice (NOT-A-SOLVER): warstwa tylko prezentuje. Status, liczniki, stopień
 * dowodowy i braki pochodzą WYŁĄCZNIE z `NcRfgCaseComplianceResponse`
 * (kontrakt biegu macierzy + pola dowodowe karty S-1); zero oceny własnej, zero
 * fizyki. Odesłanie „Pokaż w macierzy" wybiera moduł w macierzy per DER obok.
 */

import { useCallback, useEffect, useState } from 'react';

import { fetchNcRfgCaseCompliance, type NcRfgCaseComplianceResponse } from '../../../ui/ncrfg-tests/api';
import {
  brakiZgodnosciPrzekrojowej,
  nazwaModuluPrzekrojowego,
  podsumowanieZgodnosciPrzekrojowej,
  rozwiazStanZgodnosciPrzekrojowej,
  stopienDowodowyModulu,
  wierszeZgodnosciPrzekrojowej,
} from './zgodnoscPrzekrojowaModel';
import { MACIERZ_STRINGS, formatMoc, formatNapiecie } from './strings';

export interface SekcjaZgodnosciPrzekrojowejProps {
  /** Aktywny przypadek; `null` = brak (uczciwy stan zerowy, zero biegu). */
  readonly caseId: string | null;
  /** Operator sieci — ten sam wybór co nagłówek macierzy per DER (jeden stan). */
  readonly operatorId: string;
  /** der_ref → nazwa wyświetlana, z tego samego źródła co kolumny macierzy obok. */
  readonly nazwyModulow: Readonly<Record<string, string>>;
  /**
   * Odesłanie do macierzy per DER: wybiera moduł (panel modułu + kolumna).
   * Renderowane tylko dla modułów znanych macierzy (klucz w `nazwyModulow`) —
   * bez martwego kliku dla DER spoza store'u.
   */
  readonly onWybierzModul?: (derRef: string) => void;
}

const ETYKIETA_STATUSU: Record<string, string> = {
  zgodny: MACIERZ_STRINGS.zgodnoscPrzekrojowaWerdyktZgodny,
  niezgodny: MACIERZ_STRINGS.zgodnoscPrzekrojowaWerdyktNiezgodny,
  brak_danych: MACIERZ_STRINGS.zgodnoscPrzekrojowaWerdyktBrakDanych,
};

// Ta sama paleta co komórki macierzy per DER (`macierz.css`): brak danych = `warn`.
const KLASA_STATUSU: Record<string, string> = {
  zgodny: 'mvd-oze-werdykt-ok',
  niezgodny: 'mvd-oze-werdykt-err',
  brak_danych: 'mvd-oze-werdykt-warn',
};

export function SekcjaZgodnosciPrzekrojowej({
  caseId,
  operatorId,
  nazwyModulow,
  onWybierzModul,
}: SekcjaZgodnosciPrzekrojowejProps): JSX.Element {
  const [wynik, setWynik] = useState<NcRfgCaseComplianceResponse | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  const zaladuj = useCallback(async (): Promise<void> => {
    if (!caseId) return;
    setLadowanie(true);
    setBlad(null);
    try {
      setWynik(await fetchNcRfgCaseCompliance(caseId, operatorId));
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

  const stan = rozwiazStanZgodnosciPrzekrojowej({ caseId, ladowanie, blad, wynik });
  const bieg = wynik?.bieg ?? null;
  const wiersze = wynik ? wierszeZgodnosciPrzekrojowej(wynik, nazwyModulow) : [];
  const podsum = wynik ? podsumowanieZgodnosciPrzekrojowej(wiersze) : null;
  const braki = brakiZgodnosciPrzekrojowej(bieg, nazwyModulow);
  const operatorNazwa = bieg?.modules[0]?.operator_name_pl ?? wynik?.operator_id ?? null;

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
          disabled={!caseId || ladowanie}
          data-testid="mvd-oze-zgodnosc-przekrojowa-odswiez"
        >
          {ladowanie ? MACIERZ_STRINGS.zgodnoscPrzekrojowaLadowanie : MACIERZ_STRINGS.zgodnoscPrzekrojowaOdswiez}
        </button>
      </div>
      <p className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.zgodnoscPrzekrojowaOpis}</p>

      {stan === 'brak_przypadku' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-zgodnosc-przekrojowa-brak-przypadku">
          {MACIERZ_STRINGS.zgodnoscPrzekrojowaBrakPrzypadku}
        </p>
      ) : stan === 'blad' ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-zgodnosc-przekrojowa-blad">
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
      ) : wynik && podsum ? (
        <>
          {/* Karta S-1: stopień dowodowy biegu — z backendu (`bieg.reporting_status`),
              zero oceny lokalnej; baner tylko gdy dowód nie wystarcza do zgłoszenia. */}
          {bieg && bieg.reporting_status === 'not_reportable' ? (
            <div className="mvd-oze-blad" data-testid="mvd-oze-zgodnosc-przekrojowa-baner-brak-dowodu">
              <strong>{MACIERZ_STRINGS.banerBrakDowoduTytul}</strong>
              <p style={{ margin: '4px 0 0' }}>{bieg.evidence_note_pl}</p>
            </div>
          ) : null}

          <div className="mvd-oze-podsum" data-testid="mvd-oze-zgodnosc-przekrojowa-podsum">
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduly}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">{podsum.liczbaModulow}</span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleZgodne}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">{podsum.zgodne}</span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleNiezgodne}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">{podsum.niezgodne}</span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.moduleBrakDanych}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">{podsum.brakDanych}</span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.wymogiSpelnione}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">
                {podsum.spelnioneRazem} / {podsum.wymaganeRazem}
              </span>
            </div>
            {operatorNazwa ? (
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.zgodnoscPrzekrojowaOperator}</span>
                <span className="mvd-oze-podsum-wart" data-testid="mvd-oze-zgodnosc-przekrojowa-operator">
                  {operatorNazwa}
                </span>
              </div>
            ) : null}
            {bieg ? (
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.zgodnoscPrzekrojowaDowodBiegu}</span>
                <span className="mvd-oze-podsum-wart" data-testid="mvd-oze-zgodnosc-przekrojowa-dowod-biegu">
                  {bieg.reporting_status === 'reportable'
                    ? MACIERZ_STRINGS.zgodnoscPrzekrojowaDowodTak
                    : MACIERZ_STRINGS.zgodnoscPrzekrojowaDowodNie}
                </span>
              </div>
            ) : null}
          </div>

          {bieg ? (
            <div className="mvd-oze-macierz-wrap">
              <table className="mvd-oze-macierz" data-testid="mvd-oze-zgodnosc-przekrojowa-tabela">
                <thead>
                  <tr>
                    <th className="mvd-oze-col-test">{MACIERZ_STRINGS.zgodnoscPrzekrojowaKolModul}</th>
                    <th>{MACIERZ_STRINGS.klasaModulu}</th>
                    <th>{MACIERZ_STRINGS.kolMoc}</th>
                    <th>{MACIERZ_STRINGS.kolNapiecie}</th>
                    <th>{MACIERZ_STRINGS.zgodnoscPrzekrojowaKolWerdykt}</th>
                    <th>{MACIERZ_STRINGS.zgodnoscPrzekrojowaKolSpelnione}</th>
                    <th>{MACIERZ_STRINGS.zgodnoscPrzekrojowaKolNiespelnione}</th>
                    <th>{MACIERZ_STRINGS.zgodnoscPrzekrojowaKolBrakDanych}</th>
                    <th>{MACIERZ_STRINGS.zgodnoscPrzekrojowaKolDowod}</th>
                    {onWybierzModul ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {bieg.modules.map((modul) => {
                    const dowod = stopienDowodowyModulu(bieg, modul.der_ref);
                    const wMacierzy = onWybierzModul && modul.der_ref in nazwyModulow;
                    return (
                      <tr key={modul.der_ref} data-testid="mvd-oze-zgodnosc-przekrojowa-wiersz">
                        <td className="mvd-oze-col-test">
                          {nazwaModuluPrzekrojowego(modul.der_ref, modul.der_name, nazwyModulow)}
                        </td>
                        <td className="mvd-oze-num">{modul.module_type}</td>
                        <td className="mvd-oze-num">{formatMoc(modul.p_max_kw)}</td>
                        <td className="mvd-oze-num">{formatNapiecie(modul.voltage_kv)}</td>
                        <td>
                          <span
                            className={`mvd-oze-komorka ${KLASA_STATUSU[modul.overall_status] ?? ''}`}
                            data-testid={`mvd-oze-zgodnosc-przekrojowa-werdykt-${modul.der_ref}`}
                          >
                            {ETYKIETA_STATUSU[modul.overall_status] ?? modul.overall_status}
                          </span>
                        </td>
                        <td className="mvd-oze-num">
                          {modul.pass_count} / {modul.required_count}
                        </td>
                        <td className="mvd-oze-num">{modul.fail_count}</td>
                        <td className="mvd-oze-num">{modul.no_data_count}</td>
                        <td>
                          <span data-testid={`mvd-oze-zgodnosc-przekrojowa-dowod-${modul.der_ref}`}>
                            {dowod === 'reportable'
                              ? MACIERZ_STRINGS.zgodnoscPrzekrojowaDowodTak
                              : dowod === 'not_reportable'
                                ? MACIERZ_STRINGS.zgodnoscPrzekrojowaDowodNie
                                : '—'}
                          </span>
                        </td>
                        {onWybierzModul ? (
                          <td>
                            {wMacierzy ? (
                              <button
                                type="button"
                                className="mvd-btn"
                                onClick={() => onWybierzModul(modul.der_ref)}
                                data-testid={`mvd-oze-zgodnosc-przekrojowa-pokaz-${modul.der_ref}`}
                              >
                                {MACIERZ_STRINGS.zgodnoscPrzekrojowaPokazWMacierzy}
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

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

          {braki.length > 0 ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-zgodnosc-przekrojowa-niespelnione">
              <span className="mvd-oze-panel-etyk">
                {MACIERZ_STRINGS.zgodnoscPrzekrojowaNiespelnioneTytul}
              </span>
              <ul className="mvd-oze-lista">
                {braki.map((modul) => (
                  <li key={modul.derRef} data-testid={`mvd-oze-zgodnosc-przekrojowa-niespelniony-${modul.derRef}`}>
                    <div style={{ fontWeight: 600 }}>{modul.nazwa}</div>
                    <ul className="mvd-oze-lista">
                      {modul.testy.map((test) => (
                        <li key={test.test_id}>
                          {test.test_id} {test.ability_pl}: {test.summary_pl}
                          {test.fix_actions.length > 0 ? ` — ${test.fix_actions.join(' ')}` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
