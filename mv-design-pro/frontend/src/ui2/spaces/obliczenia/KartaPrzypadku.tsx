/*
 * Karta przypadku obliczeniowego (W-501) — konfiguracja + sekcja „Założenia"
 * (JAWNE założenia: współczynnik napięciowy c, temperatura, stan łączeń;
 * „założenia są częścią wyniku" — AUDYT_RADY_SPECJALISTOW W-501). W pełni sterowana
 * propsami (pełny rekord `StudyCase` z konfiguracją). Parametry i etykiety z
 * ISTNIEJĄCYCH typów (`CONFIG_FIELD_LABELS`, `types.ts:194`); pola nieobecne w typie
 * (temperatura, stan łączeń) → wiersze „wkrótce" (bez zgadywania — karta §2).
 *
 * Status wyników renderowany jako tag PL (aktualne/nieaktualne/brak) — spójnie z
 * E15.2, RAZEM z przyczyną i listą zmian, które unieważniły wynik (CV-2-W:
 * odpowiedź z przypadkiem niesie `result_status_reason_pl`, parę rewizji i
 * `zmiany_od_biegu`, więc karta nie musi już mówić „nieaktualne" bez powodu ani
 * dopytywać osobnym zapytaniem).
 */

import type { StudyCase, StudyCaseConfig } from '../../../ui/study-cases/types';
import { CONFIG_FIELD_LABELS } from '../../../ui/study-cases/types';
import { ListaZmianOdBiegu } from '../../freshness';
import {
  PRZYPADKI_STRINGS as T,
  STATUS_WYNIKOW_LABEL,
  formatWartoscKonfiguracji,
} from './strings';

const WARIANT_STATUSU: Record<StudyCase['result_status'], string> = {
  NONE: 'mvd-tag-mut',
  FRESH: 'mvd-tag-ok',
  OUTDATED: 'mvd-tag-warn',
};

const POLA_ZWARCIA: Array<keyof StudyCaseConfig> = [
  'c_factor_max',
  'c_factor_min',
  'sc_input_mode',
  'sc_simplified_sk_mva',
  'sc_simplified_r_x_ratio',
];
const POLA_ROZPLYW: Array<keyof StudyCaseConfig> = ['base_mva', 'max_iterations', 'tolerance'];
const POLA_OPCJE: Array<keyof StudyCaseConfig> = [
  'include_motor_contribution',
  'include_inverter_contribution',
  'thermal_time_seconds',
];
const POLA_OPERATOR: Array<keyof StudyCaseConfig> = ['operator_profile_id'];

interface KartaPrzypadkuProps {
  przypadek: StudyCase | null;
  ladowanie: boolean;
  blad: string | null;
}

function SekcjaKonfiguracji({
  tytul,
  pola,
  config,
}: {
  tytul: string;
  pola: Array<keyof StudyCaseConfig>;
  config: StudyCaseConfig;
}) {
  return (
    <section className="mvd-karta-sekcja" aria-label={tytul}>
      <h4 className="mvd-karta-sekcja-tytul">{tytul}</h4>
      <dl className="mvd-karta-pary">
        {pola.map((pole) => (
          <div key={pole} className="mvd-karta-para">
            <dt>{CONFIG_FIELD_LABELS[pole]}</dt>
            <dd className="mvd-num">{formatWartoscKonfiguracji(pole, config[pole])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function KartaPrzypadku({ przypadek, ladowanie, blad }: KartaPrzypadkuProps) {
  if (ladowanie) {
    return (
      <div className="mvd-karta-pusto" data-testid="mvd-karta-ladowanie">
        {T.kartaLadowanie}
      </div>
    );
  }
  if (blad) {
    return (
      <div className="mvd-karta-pusto mvd-karta-blad" role="alert" data-testid="mvd-karta-blad">
        {T.kartaBlad}
      </div>
    );
  }
  if (!przypadek) {
    return (
      <div className="mvd-karta-pusto" data-testid="mvd-karta-brak">
        {T.kartaBrakWyboru}
      </div>
    );
  }

  const { config } = przypadek;

  return (
    <article className="mvd-karta" data-testid="mvd-karta">
      <header className="mvd-karta-naglowek">
        <div className="mvd-karta-tytul-wiersz">
          <h3 className="mvd-karta-tytul">{przypadek.name}</h3>
          {przypadek.is_active && <span className="mvd-karta-aktywny">{T.aktywny}</span>}
        </div>
        <span
          className={`mvd-tag ${WARIANT_STATUSU[przypadek.result_status]}`}
          data-testid="mvd-karta-status"
          title={przypadek.result_status_reason_pl}
        >
          {STATUS_WYNIKOW_LABEL[przypadek.result_status]}
        </span>
        {przypadek.description.trim() && (
          <p className="mvd-karta-opis">{przypadek.description}</p>
        )}
      </header>

      <ListaZmianOdBiegu status={przypadek} />

      <section className="mvd-karta-sekcja mvd-karta-zalozenia" aria-label={T.sekcjaZalozenia}>
        <h4 className="mvd-karta-sekcja-tytul">{T.sekcjaZalozenia}</h4>
        <table className="mvd-karta-tabela">
          <thead>
            <tr>
              <th>{T.kolParametr}</th>
              <th>{T.kolWartosc}</th>
              <th>{T.kolPochodzenie}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{T.zalozenieCMax}</td>
              <td className="mvd-num">{formatWartoscKonfiguracji('c_factor_max', config.c_factor_max)}</td>
              <td className="mvd-karta-pochodzenie">{T.pochodzenieKonfiguracja}</td>
            </tr>
            <tr>
              <td>{T.zalozenieCMin}</td>
              <td className="mvd-num">{formatWartoscKonfiguracji('c_factor_min', config.c_factor_min)}</td>
              <td className="mvd-karta-pochodzenie">{T.pochodzenieKonfiguracja}</td>
            </tr>
            <tr data-testid="mvd-karta-zalozenie-temperatura">
              <td>{T.zalozenieTemperatura}</td>
              <td className="mvd-num mvd-wkrotce-wartosc">{T.brakWartosci}</td>
              <td className="mvd-karta-pochodzenie mvd-wkrotce">{T.pochodzenieWkrotce}</td>
            </tr>
            <tr data-testid="mvd-karta-zalozenie-laczenia">
              <td>{T.zalozenieStanLaczen}</td>
              <td className="mvd-num mvd-wkrotce-wartosc">{T.brakWartosci}</td>
              <td className="mvd-karta-pochodzenie mvd-wkrotce">{T.pochodzenieWkrotce}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <SekcjaKonfiguracji tytul={T.sekcjaZwarcia} pola={POLA_ZWARCIA} config={config} />
      <SekcjaKonfiguracji tytul={T.sekcjaRozplyw} pola={POLA_ROZPLYW} config={config} />
      <SekcjaKonfiguracji tytul={T.sekcjaOpcje} pola={POLA_OPCJE} config={config} />
      <SekcjaKonfiguracji tytul={T.sekcjaOperator} pola={POLA_OPERATOR} config={config} />
    </article>
  );
}
