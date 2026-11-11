/*
 * Sekcja „Zdolność punktu przyłączenia (siła sieci)" karty modułu (P47a §1.2).
 * SCR per węzeł + werdykt PL + WSCR systemowy z zakończonego przebiegu
 * zwarciowego (`GET /api/oze-analysis/grid-strength?run_id=`). Ślad WHITE BOX
 * rozwijany inline. Werdykty i wskaźniki pochodzą WYŁĄCZNIE z backendu — warstwa
 * tylko prezentuje (NOT-A-SOLVER). Brak przebiegu → jawna instrukcja.
 *
 * Standard warsztatu KD6 (karta PULPIT-OZE-KD6): WSCR i liczebności w jednej linii, węzły jako
 * zwarta tabela (jednostki w nagłówkach), uzasadnienia i wywody po rozwinięciu.
 */

import { useId, useState } from 'react';

import { pobierzSileSieci, type WpisSilyWezla } from '../api';
import { InformacjeAudytowe, useNazwaObiektu } from '../../wyniki/wzorzec';
import { SladAnalizy } from './SladAnalizy';
import { busRefModuluSily } from './pulpitModel';
import { useAnaliza } from './useAnaliza';
import {
  BRAKI_DANYCH_SILY,
  formatWskaznik,
  klasaWerdyktuSily,
  PULPIT_STRINGS,
} from './strings';
import { useAktywnyRunId } from '../../wyniki/kontekst/kontekstWyniku';
import { formatLiczba } from '../macierz/strings';
import { TekstZWzorami } from '../../kreatory/rama/tekstZWzorami';

export interface SekcjaSilySieciProps {
  /** Tryb ekspercki odsłania identyfikatory katalogowe/śladu. */
  readonly szczegolyAudytowe: boolean;
  /** Referencja wyróżnionego modułu (klik w pulpicie); `null` → brak wyróżnienia. */
  readonly wyroznionyModul?: string | null;
}

const LICZBA_KOLUMN_SILY = 7;

/** Liczba bez jednostki (jednostka w nagłówku kolumny) — formater pulpitu. */
function bezJednostki(wartosc: number | null, miejsca: number): string {
  return wartosc === null || !Number.isFinite(wartosc) ? '—' : formatLiczba(wartosc, miejsca);
}

/**
 * Wiersz węzła w tabeli siły sieci: węzeł (z modelu), SCR, S_k'', moc zainstalowana, napięcie
 * znamionowe i ocena backendu. Uzasadnienie, braki danych i kroki obliczeń ze wzorami —
 * jednym przyciskiem „Szczegóły" na węzeł (standard warsztatu KD6).
 */
function WierszWezla({
  wpis,
  wyrozniony,
}: {
  readonly wpis: WpisSilyWezla;
  readonly wyrozniony: boolean;
}): JSX.Element {
  const [otwarty, setOtwarty] = useState(false);
  const idSzczegolow = useId();
  // Karta #145: węzeł nazwany z modelu, nigdy referencją.
  const nazwaObiektu = useNazwaObiektu();
  return (
    <>
      <tr
        className={wyrozniony ? 'mvd-oze-wyrozniony' : undefined}
        data-testid={`mvd-oze-sila-wezel-${wpis.bus_ref}`}
        data-wyrozniony={wyrozniony ? 'true' : undefined}
      >
        <th scope="row" className="mvd-ncrfg-kol-nazwa">
          <span className="mvd-ncrfg-wymaganie-nazwa">{nazwaObiektu(wpis.bus_ref)}</span>
        </th>
        <td className="mvd-ncrfg-num">{formatWskaznik(wpis.scr)}</td>
        <td className="mvd-ncrfg-num">{bezJednostki(wpis.s_sc_mva, 2)}</td>
        <td className="mvd-ncrfg-num">{bezJednostki(wpis.s_installed_mva, 2)}</td>
        <td className="mvd-ncrfg-num">{bezJednostki(wpis.nominal_kv, 2)}</td>
        <td>
          <span
            className={`mvd-oze-komorka ${klasaWerdyktuSily(wpis.verdict)}`}
            data-testid={`mvd-oze-sila-werdykt-${wpis.bus_ref}`}
          >
            {wpis.verdict}
          </span>
        </td>
        <td className="mvd-ncrfg-kol-akcja">
          <button
            type="button"
            className="mvd-ncrfg-przelacz"
            aria-expanded={otwarty}
            aria-controls={idSzczegolow}
            onClick={() => setOtwarty((o) => !o)}
            data-testid={`mvd-oze-sila-slad-otworz-${wpis.bus_ref}`}
          >
            {otwarty ? PULPIT_STRINGS.sladUkryj : PULPIT_STRINGS.sladPokaz}
          </button>
        </td>
      </tr>
      {otwarty ? (
        <tr className="mvd-ncrfg-wiersz-szczegolow">
          <td colSpan={LICZBA_KOLUMN_SILY} id={idSzczegolow} data-testid={`mvd-oze-sila-szczegoly-${wpis.bus_ref}`}>
            <p className="mvd-ncrfg-zdanie">{wpis.why_pl}</p>
            {wpis.missing_data.length > 0 ? (
              <p className="mvd-ncrfg-zdanie">
                <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.silaBrakDanych}: </span>
                {wpis.missing_data.map((kod) => BRAKI_DANYCH_SILY[kod]).join('; ')}
              </p>
            ) : null}
            {wpis.white_box.length > 0 ? <SladAnalizy kroki={wpis.white_box} /> : null}
          </td>
        </tr>
      ) : null}
    </>
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
          <p style={{ margin: '6px 0 0' }}><TekstZWzorami tekst={PULPIT_STRINGS.silaBrakOpis} /></p>
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
        <div data-testid="mvd-oze-sila-wynik" className="mvd-ncrfg-wymagania">
          {/* Jedna linia: WSCR systemowy z oceną i liczebności węzłów; uzasadnienie i wywód
              WSCR — po rozwinięciu (standard warsztatu KD6). */}
          <div className="mvd-ncrfg-linia" data-testid="mvd-oze-sila-podsum">
            <span>
              <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.silaWscr}: </span>
              <span className="mvd-ncrfg-num" data-testid="mvd-oze-sila-wscr">
                {formatWskaznik(stan.dane.summary.wscr)}
              </span>
            </span>
            <span
              className={`mvd-oze-komorka ${klasaWerdyktuSily(stan.dane.summary.wscr_verdict)}`}
              data-testid="mvd-oze-sila-wscr-werdykt"
            >
              {stan.dane.summary.wscr_verdict}
            </span>
            <span>
              <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.silaBadane}: </span>
              <span className="mvd-ncrfg-num">{stan.dane.summary.total_buses}</span>
            </span>
            <span>
              <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.silaSlabe}: </span>
              <span className="mvd-ncrfg-num">{stan.dane.summary.weak_bus_count}</span>
            </span>
            <span>
              <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.silaNieobliczone}: </span>
              <span className="mvd-ncrfg-num">{stan.dane.summary.not_computed_count}</span>
            </span>
            <button
              type="button"
              className="mvd-ncrfg-przelacz"
              aria-expanded={wscrSlad}
              onClick={() => setWscrSlad((s) => !s)}
              data-testid="mvd-oze-sila-wscr-slad-otworz"
            >
              {wscrSlad ? PULPIT_STRINGS.sladUkryj : PULPIT_STRINGS.sladPokaz}
            </button>
          </div>
          {wscrSlad ? (
            <div className="mvd-ncrfg-wiersz-szczegolow" data-testid="mvd-oze-sila-wscr-uzasadnienie">
              <p className="mvd-ncrfg-zdanie">{stan.dane.summary.wscr_why_pl}</p>
              {stan.dane.summary.wscr_white_box.length > 0 ? (
                <SladAnalizy kroki={stan.dane.summary.wscr_white_box} />
              ) : null}
            </div>
          ) : null}

          {wyroznionyModul && wyroznionyWezel ? (
            <p className="mvd-oze-wyroznienie-wezel" data-testid="mvd-oze-sila-wyroznienie-wezel">
              {PULPIT_STRINGS.silaWyroznionyWezel}: {nazwaObiektu(wyroznionyWezel)}
            </p>
          ) : null}
          {wyroznionyModul && !wyroznionyWezel ? (
            <p className="mvd-oze-wyroznienie-brak" data-testid="mvd-oze-sila-wyroznienie-brak">
              {PULPIT_STRINGS.silaWyroznienieBrak}
            </p>
          ) : null}
          {stan.dane.entries.length === 0 ? (
            <p style={{ margin: 0 }} className="mvd-oze-panel-etyk">
              {PULPIT_STRINGS.silaBrakWezlow}
            </p>
          ) : (
            <table className="mvd-ncrfg-tabela" aria-label={PULPIT_STRINGS.silaWezly}>
              <thead>
                <tr>
                  <th scope="col">{PULPIT_STRINGS.silaWezly}</th>
                  <th scope="col">{PULPIT_STRINGS.silaScr}</th>
                  <th scope="col">
                    <TekstZWzorami tekst={PULPIT_STRINGS.silaKolSsc} />
                  </th>
                  <th scope="col">{PULPIT_STRINGS.silaKolSinst}</th>
                  <th scope="col">{PULPIT_STRINGS.silaKolNapiecie}</th>
                  <th scope="col">{PULPIT_STRINGS.silaWerdykt}</th>
                  <th scope="col">
                    <span className="mvd-sr-only">{PULPIT_STRINGS.sladPokaz}</span>
                  </th>
                </tr>
              </thead>
              <tbody data-testid="mvd-oze-sila-wezly">
                {stan.dane.entries.map((wpis) => (
                  <WierszWezla
                    key={wpis.bus_ref}
                    wpis={wpis}
                    wyrozniony={wyroznionyWezel === wpis.bus_ref}
                  />
                ))}
              </tbody>
            </table>
          )}

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
