/*
 * Sekcja „Zdolność punktu przyłączenia (siła sieci)" karty modułu (P47a §1.2).
 * SCR per węzeł + werdykt PL + WSCR systemowy z zakończonego przebiegu
 * zwarciowego (`GET /api/oze-analysis/grid-strength?run_id=`). Ślad WHITE BOX
 * rozwijany inline. Werdykty i wskaźniki pochodzą WYŁĄCZNIE z backendu — warstwa
 * tylko prezentuje (NOT-A-SOLVER). Brak przebiegu → jawna instrukcja.
 */

import { useState } from 'react';

import { pobierzSileSieci, type WpisSilyWezla } from '../api';
import { InformacjeAudytowe, useNazwaObiektu } from '../../wyniki/wzorzec';
import { EtykietaWerdyktu, KartaWerdyktu } from '../../wyniki/wzorzec/KartaWerdyktu';
import { SladAnalizy } from './SladAnalizy';
import { busRefModuluSily } from './pulpitModel';
import { useAnaliza } from './useAnaliza';
import {
  BRAKI_DANYCH_SILY,
  formatKv,
  formatMva,
  formatWskaznik,
  PULPIT_STRINGS,
} from './strings';
import { useAktywnyRunId } from '../../wyniki/kontekst/kontekstWyniku';

export interface SekcjaSilySieciProps {
  /** Tryb ekspercki odsłania identyfikatory katalogowe/śladu. */
  readonly szczegolyAudytowe: boolean;
  /** Referencja wyróżnionego modułu (klik w pulpicie); `null` → brak wyróżnienia. */
  readonly wyroznionyModul?: string | null;
}

function WpisWezla({
  wpis,
  wyrozniony,
}: {
  readonly wpis: WpisSilyWezla;
  readonly wyrozniony: boolean;
}): JSX.Element {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  // Karta #145: węzeł nazwany z modelu, nigdy referencją.
  const nazwaObiektu = useNazwaObiektu();
  return (
    <li
      className={`mvd-oze-slad-krok${wyrozniony ? ' mvd-oze-wyrozniony' : ''}`}
      data-testid={`mvd-oze-sila-wezel-${wpis.bus_ref}`}
      data-wyrozniony={wyrozniony ? 'true' : undefined}
    >
      <div className="mvd-oze-metryka">
        <span>{nazwaObiektu(wpis.bus_ref)}</span>
        {/* Etykieta Z REKORDU (kontrakt werdyktu §9) — klasa siły sieci jest w uzasadnieniu. */}
        <EtykietaWerdyktu
          etykieta={wpis.ocena.etykieta}
          status={wpis.ocena.status_maszynowy}
          testid={`mvd-oze-sila-werdykt-${wpis.bus_ref}`}
        />
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
      <KartaWerdyktu rekord={wpis.ocena} naglowek={PULPIT_STRINGS.silaOcenaWezla} />
      {wpis.missing_data.length > 0 ? (
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.silaBrakDanych}</span>
          <span>{wpis.missing_data.map((kod) => BRAKI_DANYCH_SILY[kod]).join('; ')}</span>
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

export function SekcjaSilySieci({
  szczegolyAudytowe,
  wyroznionyModul = null,
}: SekcjaSilySieciProps): JSX.Element {
  // Karta K8: aktywny bieg rodziny z magazynu kontekstu wyniku (jedna prawda wyboru).
  const runId = useAktywnyRunId('zwarcie');
  const stan = useAnaliza(runId, pobierzSileSieci);
  const [wscrSlad, setWscrSlad] = useState(false);
  // Karta #145: wyróżniony węzeł nazwany z modelu, nigdy referencją.
  const nazwaObiektu = useNazwaObiektu();

  const wyroznionyWezel =
    stan.rodzaj === 'gotowe' && wyroznionyModul
      ? busRefModuluSily(stan.dane, wyroznionyModul)
      : null;

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
              <EtykietaWerdyktu
                etykieta={stan.dane.summary.wscr_ocena.etykieta}
                status={stan.dane.summary.wscr_ocena.status_maszynowy}
                testid="mvd-oze-sila-wscr-werdykt"
              />
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
          <KartaWerdyktu rekord={stan.dane.summary.wscr_ocena} naglowek={PULPIT_STRINGS.silaOcenaWscr} />
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
            {wyroznionyModul && wyroznionyWezel ? (
              <p
                className="mvd-oze-wyroznienie-wezel"
                data-testid="mvd-oze-sila-wyroznienie-wezel"
              >
                {PULPIT_STRINGS.silaWyroznionyWezel}: {nazwaObiektu(wyroznionyWezel)}
              </p>
            ) : null}
            {wyroznionyModul && !wyroznionyWezel ? (
              <p
                className="mvd-oze-wyroznienie-brak"
                data-testid="mvd-oze-sila-wyroznienie-brak"
              >
                {PULPIT_STRINGS.silaWyroznienieBrak}
              </p>
            ) : null}
            {stan.dane.entries.length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {PULPIT_STRINGS.silaBrakWezlow}
              </p>
            ) : (
              <ul className="mvd-oze-analiza-lista" data-testid="mvd-oze-sila-wezly">
                {stan.dane.entries.map((wpis) => (
                  <WpisWezla
                    key={wpis.bus_ref}
                    wpis={wpis}
                    wyrozniony={wyroznionyWezel === wpis.bus_ref}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Karta #145: identyfikator analizy wyłącznie w „Informacjach audytowych". */}
          <InformacjeAudytowe
            szczegolyAudytowe={szczegolyAudytowe}
            testid="mvd-oze-sila-analiza-id"
            wiersze={[{ etykieta: PULPIT_STRINGS.identyfikatorAnalizy, wartosc: stan.dane.analysis_id }]}
          />
        </div>
      )}
    </section>
  );
}
