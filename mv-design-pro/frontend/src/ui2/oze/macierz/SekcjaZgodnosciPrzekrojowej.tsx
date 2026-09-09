/*
 * Sekcja „Zgodność przekrojowa przypadku" (karta W3-D, 2026-09-09) — obok
 * macierzy per DER (`MacierzNcRfg`). Czyta `GET /api/ncrfg-tests/cases/
 * {case_id}/compliance`: zgodność WSZYSTKICH źródeł przekształtnikowych modelu
 * naraz, liczona NA ŻYWO z committed ENM przez kanon
 * (`application/ncrfg_compliance/checker.py`) — bez ręcznego kompletowania
 * zdolności modułu, jak wymaga tego bieg macierzy obok.
 *
 * Granice (NOT-A-SOLVER): warstwa tylko prezentuje. Werdykty pochodzą
 * WYŁĄCZNIE z `NcRfgCaseComplianceResponse`; zero oceny własnej, zero fizyki.
 */

import { useCallback, useEffect, useState } from 'react';

import { fetchNcRfgCaseCompliance, type NcRfgCaseComplianceResponse } from '../../../ui/ncrfg-tests/api';
import {
  nazwaModuluPrzekrojowego,
  podsumowanieZgodnosciPrzekrojowej,
  rozwiazStanZgodnosciPrzekrojowej,
  testyNiespelnione,
} from './zgodnoscPrzekrojowaModel';
import { MACIERZ_STRINGS, formatMoc, formatNapiecie } from './strings';

export interface SekcjaZgodnosciPrzekrojowejProps {
  /** Aktywny przypadek; `null` = brak (uczciwy stan zerowy, zero biegu). */
  readonly caseId: string | null;
  /** Operator sieci — ten sam wybór co nagłówek macierzy per DER (jeden stan). */
  readonly operatorId: string;
  /** der_ref → nazwa wyświetlana, z tego samego źródła co kolumny macierzy obok. */
  readonly nazwyModulow: Readonly<Record<string, string>>;
}

export function SekcjaZgodnosciPrzekrojowej({
  caseId,
  operatorId,
  nazwyModulow,
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
  const podsum = wynik ? podsumowanieZgodnosciPrzekrojowej(wynik.reports) : null;
  const operatorNazwa = wynik?.reports[0]?.operator_name_pl ?? wynik?.operator_id ?? null;
  const niezgodneRaporty = wynik ? wynik.reports.filter((r) => !r.overall_pass) : [];

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
            {operatorNazwa ? (
              <div className="mvd-oze-podsum-poz">
                <span className="mvd-oze-podsum-etyk">{MACIERZ_STRINGS.zgodnoscPrzekrojowaOperator}</span>
                <span className="mvd-oze-podsum-wart" data-testid="mvd-oze-zgodnosc-przekrojowa-operator">
                  {operatorNazwa}
                </span>
              </div>
            ) : null}
          </div>

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
                </tr>
              </thead>
              <tbody>
                {wynik.reports.map((report) => (
                  <tr key={report.der_ref} data-testid="mvd-oze-zgodnosc-przekrojowa-wiersz">
                    <td className="mvd-oze-col-test">
                      {nazwaModuluPrzekrojowego(report.der_ref, nazwyModulow)}
                    </td>
                    <td className="mvd-oze-num">{report.module_type}</td>
                    <td className="mvd-oze-num">{formatMoc(report.p_max_kw)}</td>
                    <td className="mvd-oze-num">{formatNapiecie(report.voltage_kv)}</td>
                    <td>
                      <span
                        className={`mvd-oze-komorka ${
                          report.overall_pass ? 'mvd-oze-werdykt-ok' : 'mvd-oze-werdykt-err'
                        }`}
                        data-testid={`mvd-oze-zgodnosc-przekrojowa-werdykt-${report.der_ref}`}
                      >
                        {report.overall_pass
                          ? MACIERZ_STRINGS.zgodnoscPrzekrojowaWerdyktZgodny
                          : MACIERZ_STRINGS.zgodnoscPrzekrojowaWerdyktNiezgodny}
                      </span>
                    </td>
                    <td className="mvd-oze-num">
                      {report.passed_count} / {report.total_tests}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {niezgodneRaporty.length > 0 ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-zgodnosc-przekrojowa-niespelnione">
              <span className="mvd-oze-panel-etyk">
                {MACIERZ_STRINGS.zgodnoscPrzekrojowaNiespelnioneTytul}
              </span>
              <ul className="mvd-oze-lista">
                {niezgodneRaporty.map((report) => (
                  <li key={report.der_ref} data-testid={`mvd-oze-zgodnosc-przekrojowa-niespelniony-${report.der_ref}`}>
                    <div style={{ fontWeight: 600 }}>
                      {nazwaModuluPrzekrojowego(report.der_ref, nazwyModulow)}
                    </div>
                    <ul className="mvd-oze-lista">
                      {testyNiespelnione(report).map((test) => (
                        <li key={test.test_id}>
                          {test.test_name_pl}
                          {test.message_pl ? `: ${test.message_pl}` : ''}
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
