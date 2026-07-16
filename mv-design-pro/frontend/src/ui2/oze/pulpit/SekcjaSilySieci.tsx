/*
 * Sekcja „Zdolność punktu przyłączenia (siła sieci)" karty modułu (P47a §1.2).
 * SCR per węzeł + werdykt PL + WSCR systemowy z zakończonego przebiegu
 * zwarciowego (`GET /api/oze-analysis/grid-strength?run_id=`). Ślad WHITE BOX
 * rozwijany inline. Werdykty i wskaźniki pochodzą WYŁĄCZNIE z backendu — warstwa
 * tylko prezentuje (NOT-A-SOLVER). Brak przebiegu → jawna instrukcja.
 */

import { useState } from 'react';

import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { pobierzSileSieci, type WpisSilyWezla } from '../api';
import { SladAnalizy } from './SladAnalizy';
import { wybierzPrzebiegZwarciowy } from './pulpitModel';
import { useAnaliza } from './useAnaliza';
import {
  formatKv,
  formatMva,
  formatWskaznik,
  klasaWerdyktuSily,
  PULPIT_STRINGS,
} from './strings';

export interface SekcjaSilySieciProps {
  /** Tryb ekspercki odsłania identyfikatory katalogowe/śladu. */
  readonly trybEkspercki: boolean;
}

function WpisWezla({ wpis }: { readonly wpis: WpisSilyWezla }): JSX.Element {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  return (
    <li className="mvd-oze-slad-krok" data-testid={`mvd-oze-sila-wezel-${wpis.bus_ref}`}>
      <div className="mvd-oze-metryka">
        <span>{wpis.bus_ref}</span>
        <span
          className={`mvd-oze-komorka ${klasaWerdyktuSily(wpis.verdict)}`}
          data-testid={`mvd-oze-sila-werdykt-${wpis.bus_ref}`}
        >
          {wpis.verdict}
        </span>
      </div>
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.silaScr}</span>
        <span className="mvd-oze-num">{formatWskaznik(wpis.scr)}</span>
      </div>
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.silaSsc}</span>
        <span className="mvd-oze-num">{formatMva(wpis.s_sc_mva)}</span>
      </div>
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.silaSinst}</span>
        <span className="mvd-oze-num">{formatMva(wpis.s_installed_mva)}</span>
      </div>
      <div className="mvd-oze-metryka">
        <span>{PULPIT_STRINGS.silaNapiecie}</span>
        <span className="mvd-oze-num">{formatKv(wpis.nominal_kv)}</span>
      </div>
      <p style={{ margin: '4px 0 0' }}>{wpis.why_pl}</p>
      {wpis.missing_data.length > 0 ? (
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.silaBrakDanych}</span>
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
            data-testid={`mvd-oze-sila-slad-otworz-${wpis.bus_ref}`}
          >
            {sladWidoczny ? PULPIT_STRINGS.sladUkryj : PULPIT_STRINGS.sladPokaz}
          </button>
          {sladWidoczny ? <SladAnalizy kroki={wpis.white_box} /> : null}
        </div>
      ) : null}
    </li>
  );
}

export function SekcjaSilySieci({ trybEkspercki }: SekcjaSilySieciProps): JSX.Element {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = wybierzPrzebiegZwarciowy(runs, activeRunId);
  const stan = useAnaliza(runId, pobierzSileSieci);
  const [wscrSlad, setWscrSlad] = useState(false);

  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-pulpit-sila"
      aria-label={PULPIT_STRINGS.sekcjaZdolnosc}
    >
      <h4>{PULPIT_STRINGS.sekcjaZdolnosc}</h4>

      {stan.rodzaj === 'brak_przebiegu' ? (
        <div>
          <div className="mvd-oze-blokada" data-testid="mvd-oze-sila-brak-przebiegu">
            {PULPIT_STRINGS.silaBrakPrzebiegu}
          </div>
          <p style={{ margin: '6px 0 0' }}>{PULPIT_STRINGS.silaBrakOpis}</p>
        </div>
      ) : stan.rodzaj === 'ladowanie' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-sila-ladowanie">
          {PULPIT_STRINGS.silaLadowanie}
        </p>
      ) : stan.rodzaj === 'blad' ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-sila-blad">
          {PULPIT_STRINGS.silaBlad}: {stan.komunikat}
        </div>
      ) : (
        <div data-testid="mvd-oze-sila-wynik">
          <div className="mvd-oze-podsum" data-testid="mvd-oze-sila-podsum">
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.silaWscr}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num" data-testid="mvd-oze-sila-wscr">
                {formatWskaznik(stan.dane.summary.wscr)}
              </span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.silaWscrWerdykt}</span>
              <span
                className={`mvd-oze-komorka ${klasaWerdyktuSily(stan.dane.summary.wscr_verdict)}`}
                data-testid="mvd-oze-sila-wscr-werdykt"
              >
                {stan.dane.summary.wscr_verdict}
              </span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.silaBadane}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">
                {stan.dane.summary.total_buses}
              </span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.silaSlabe}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">
                {stan.dane.summary.weak_bus_count}
              </span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.silaNieobliczone}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">
                {stan.dane.summary.not_computed_count}
              </span>
            </div>
          </div>

          <p style={{ margin: '4px 0 0' }}>{stan.dane.summary.wscr_why_pl}</p>
          {stan.dane.summary.wscr_white_box.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="mvd-oze-slad-btn"
                aria-expanded={wscrSlad}
                onClick={() => setWscrSlad((s) => !s)}
                data-testid="mvd-oze-sila-wscr-slad-otworz"
              >
                {wscrSlad ? PULPIT_STRINGS.sladUkryj : PULPIT_STRINGS.sladPokaz}
              </button>
              {wscrSlad ? <SladAnalizy kroki={stan.dane.summary.wscr_white_box} /> : null}
            </div>
          ) : null}

          <div className="mvd-oze-panel-blok">
            <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.silaWezly}</span>
            {stan.dane.entries.length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {PULPIT_STRINGS.silaBrakWezlow}
              </p>
            ) : (
              <ul className="mvd-oze-analiza-lista" data-testid="mvd-oze-sila-wezly">
                {stan.dane.entries.map((wpis) => (
                  <WpisWezla key={wpis.bus_ref} wpis={wpis} />
                ))}
              </ul>
            )}
          </div>

          {trybEkspercki ? (
            <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-sila-analiza-id">
              {stan.dane.analysis_id}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
