/*
 * Sekcja „Adekwatność mocy biernej" karty modułu (pulpit OZE, karta P47a §1.3).
 * Rezerwy Q per źródło (q_actual, q_min/max, headroom, nasycenie), naruszenia
 * pasma napięciowego, werdykt PL i proweniencja — z zakończonego przebiegu
 * rozpływu mocy (`GET /api/oze-analysis/reactive-adequacy?run_id=`). Zero fizyki;
 * werdykty pochodzą wyłącznie z backendu. Brak przebiegu → jawna instrukcja.
 */

import { useState } from 'react';

import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { pobierzAdekwatnoscQ, type WpisZrodlaQ } from '../api';
import { SladAnalizy } from './SladAnalizy';
import { wybierzPrzebiegRozplywu } from './pulpitModel';
import { useAnaliza } from './useAnaliza';
import {
  formatMvar,
  formatPu,
  klasaWerdyktuQ,
  PULPIT_STRINGS,
} from './strings';

export interface SekcjaAdekwatnosciQProps {
  /** Tryb ekspercki odsłania identyfikatory katalogowe/śladu. */
  readonly trybEkspercki: boolean;
}

function WpisZrodla({ wpis }: { readonly wpis: WpisZrodlaQ }): JSX.Element {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  return (
    <li className="mvd-oze-slad-krok" data-testid={`mvd-oze-adekw-zrodlo-${wpis.ref}`}>
      <div className="mvd-oze-metryka">
        <span>{wpis.ref}</span>
        <span
          className={`mvd-oze-komorka ${
            wpis.is_saturated ? 'mvd-oze-werdykt-warn' : 'mvd-oze-werdykt-ok'
          }`}
          data-testid={`mvd-oze-adekw-nasycenie-${wpis.ref}`}
        >
          {wpis.is_saturated ? PULPIT_STRINGS.adekwPrzyGranicy : PULPIT_STRINGS.adekwNienasycone}
        </span>
      </div>
      {wpis.bus_ref ? (
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.adekwWezel}</span>
          <span className="mvd-oze-num">{wpis.bus_ref}</span>
        </div>
      ) : null}
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.adekwQAktualne}</span>
        <span className="mvd-oze-num">{formatMvar(wpis.q_actual_mvar)}</span>
      </div>
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.adekwQZakres}</span>
        <span className="mvd-oze-num">
          {formatMvar(wpis.q_min_mvar)} … {formatMvar(wpis.q_max_mvar)}
        </span>
      </div>
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.adekwRezerwaGora}</span>
        <span className="mvd-oze-num">{formatMvar(wpis.headroom_up_mvar)}</span>
      </div>
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.adekwRezerwaDol}</span>
        <span className="mvd-oze-num">{formatMvar(wpis.headroom_down_mvar)}</span>
      </div>
      <p style={{ margin: '4px 0 0' }}>{wpis.why_pl}</p>
      {wpis.missing_data.length > 0 ? (
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.adekwBrakDanych}</span>
          <span className="mvd-oze-num">{wpis.missing_data.join(', ')}</span>
        </div>
      ) : null}
      {wpis.white_box.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            className="mvd-oze-slad-btn"
            aria-expanded={sladWidoczny}
            onClick={() => setSladWidoczny((s) => !s)}
            data-testid={`mvd-oze-adekw-slad-otworz-${wpis.ref}`}
          >
            {sladWidoczny ? PULPIT_STRINGS.sladUkryj : PULPIT_STRINGS.sladPokaz}
          </button>
          {sladWidoczny ? <SladAnalizy kroki={wpis.white_box} /> : null}
        </div>
      ) : null}
    </li>
  );
}

export function SekcjaAdekwatnosciQ({ trybEkspercki }: SekcjaAdekwatnosciQProps): JSX.Element {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = wybierzPrzebiegRozplywu(runs, activeRunId);
  const stan = useAnaliza(runId, pobierzAdekwatnoscQ);

  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-pulpit-adekwatnosc"
      aria-label={PULPIT_STRINGS.sekcjaAdekwatnosc}
    >
      <h4>{PULPIT_STRINGS.sekcjaAdekwatnosc}</h4>

      {stan.rodzaj === 'brak_przebiegu' ? (
        <div>
          <div className="mvd-oze-blokada" data-testid="mvd-oze-adekw-brak-przebiegu">
            {PULPIT_STRINGS.adekwBrakPrzebiegu}
          </div>
          <p style={{ margin: '6px 0 0' }}>{PULPIT_STRINGS.adekwBrakOpis}</p>
        </div>
      ) : stan.rodzaj === 'ladowanie' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-adekw-ladowanie">
          {PULPIT_STRINGS.adekwLadowanie}
        </p>
      ) : stan.rodzaj === 'blad' ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-adekw-blad">
          {PULPIT_STRINGS.adekwBlad}: {stan.komunikat}
        </div>
      ) : (
        <div data-testid="mvd-oze-adekw-wynik">
          <div className="mvd-oze-podsum" data-testid="mvd-oze-adekw-podsum">
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.adekwWerdyktEt}</span>
              <span
                className={`mvd-oze-komorka ${klasaWerdyktuQ(
                  stan.dane.is_adequate,
                  stan.dane.verdict,
                )}`}
                data-testid="mvd-oze-adekw-werdykt"
              >
                {stan.dane.verdict}
              </span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.adekwRezerwaSystem}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">
                {formatMvar(stan.dane.summary.network_headroom_up_mvar)} /{' '}
                {formatMvar(stan.dane.summary.network_headroom_down_mvar)}
              </span>
            </div>
          </div>

          <p style={{ margin: '4px 0 0' }}>{stan.dane.why_pl}</p>

          {stan.dane.provenance ? (
            <div className="mvd-oze-metryka" data-testid="mvd-oze-adekw-proweniencja">
              <span>{PULPIT_STRINGS.adekwProweniencja}</span>
              <span className="mvd-oze-num">
                {stan.dane.provenance.worst_quality_label_pl}
              </span>
            </div>
          ) : null}

          <div className="mvd-oze-panel-blok">
            <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.adekwZrodla}</span>
            {stan.dane.sources.length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {PULPIT_STRINGS.adekwBrakZrodel}
              </p>
            ) : (
              <ul className="mvd-oze-analiza-lista" data-testid="mvd-oze-adekw-zrodla">
                {stan.dane.sources.map((wpis) => (
                  <WpisZrodla key={wpis.ref} wpis={wpis} />
                ))}
              </ul>
            )}
          </div>

          <div className="mvd-oze-panel-blok" data-testid="mvd-oze-adekw-naruszenia-blok">
            <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.adekwNaruszenia}</span>
            {stan.dane.voltage_violations.length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {PULPIT_STRINGS.adekwBrakNaruszen}
              </p>
            ) : (
              <ul className="mvd-oze-lista" data-testid="mvd-oze-adekw-naruszenia">
                {stan.dane.voltage_violations.map((n) => (
                  <li key={n.bus_ref} data-testid={`mvd-oze-adekw-naruszenie-${n.bus_ref}`}>
                    <div style={{ fontWeight: 600 }}>
                      {n.bus_ref} · {n.kind_pl}
                    </div>
                    <div className="mvd-oze-metryka">
                      <span>|V|</span>
                      <span className="mvd-oze-num">{formatPu(n.v_pu)}</span>
                    </div>
                    <div className="mvd-oze-panel-etyk" style={{ marginTop: 2 }}>
                      {n.why_pl}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {trybEkspercki ? (
            <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-adekw-analiza-id">
              {stan.dane.analysis_id}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
