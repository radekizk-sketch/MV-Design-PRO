/*
 * Sekcja „Adekwatność mocy biernej" karty modułu (pulpit OZE, karta P47a §1.3).
 * Rezerwy Q per źródło (q_actual, q_min/max, headroom, nasycenie), naruszenia
 * pasma napięciowego, werdykt PL i proweniencja — z zakończonego przebiegu
 * rozpływu mocy (`GET /api/oze-analysis/reactive-adequacy?run_id=`). Zero fizyki;
 * werdykty pochodzą wyłącznie z backendu. Brak przebiegu → jawna instrukcja.
 *
 * Standard warsztatu KD6 (karta PULPIT-OZE-KD6): werdykt, rezerwa systemowa, bilans i
 * proweniencja w JEDNEJ linii; źródła jako zwarta tabela (jedno źródło = jeden wiersz,
 * jednostka [Mvar] w nagłówkach); uzasadnienia backendu i kroki obliczeń ze wzorami — po
 * rozwinięciu („Szczegóły" na źródło i na ocenę), w kroju bazowym.
 */

import { TekstZWzorami } from '../../kreatory/rama';
import { useId, useState } from 'react';

import { pobierzAdekwatnoscQ, type WpisZrodlaQ } from '../api';
import { InformacjeAudytowe, useNazwaObiektu } from '../../wyniki/wzorzec';
import { SladAnalizy } from './SladAnalizy';
import { busRefModuluQ } from './pulpitModel';
import { useAnaliza } from './useAnaliza';
import {
  BRAKI_DANYCH_Q,
  klasaWerdyktuQ,
  PULPIT_STRINGS,
  WERDYKTY_ADEKWATNOSCI_Q,
} from './strings';
import { useAktywnyRunId } from '../../wyniki/kontekst/kontekstWyniku';
import { formatLiczba } from '../macierz/strings';

export interface SekcjaAdekwatnosciQProps {
  /** Tryb ekspercki odsłania identyfikatory katalogowe/śladu. */
  readonly szczegolyAudytowe: boolean;
  /** Referencja wyróżnionego modułu (klik w pulpicie); `null` → brak wyróżnienia. */
  readonly wyroznionyModul?: string | null;
}

const LICZBA_KOLUMN_Q = 7;

/** Liczba Mvar bez jednostki (jednostka w nagłówku kolumny) — formater pulpitu, 3 miejsca. */
function mvar(wartosc: number | null): string {
  return wartosc === null || !Number.isFinite(wartosc) ? '—' : formatLiczba(wartosc, 3);
}

/**
 * Rezerwa Mvar z wyróżnieniem, gdy wymaga uwagi (§10 pkt 8): wartość ujemna (źródło poza
 * zakresem regulacji) albo brak wartości przy kompletnych danych nie występuje — brak wartości
 * wynika z braków danych nazwanych w stanie. Znak pochodzi z backendu, UI niczego nie liczy.
 */
function KomorkaRezerwy({ wartosc, testid }: { readonly wartosc: number | null; readonly testid: string }) {
  return (
    <td
      className="mvd-ncrfg-num"
      data-uwaga={wartosc !== null && wartosc < 0 ? 'ujemny' : undefined}
      data-testid={testid}
    >
      {mvar(wartosc)}
    </td>
  );
}

/**
 * Wiersz źródła w tabeli adekwatności Q: nazwa źródła i węzeł (z modelu), Q bieżące, zakres
 * regulacji, rezerwy w górę i w dół [Mvar] oraz stan regulacji (przy granicy / w zakresie,
 * braki danych). Uzasadnienie backendu, braki danych słowami i kroki obliczeń ze wzorami
 * (KaTeX, krój bazowy) — jednym przyciskiem „Szczegóły" na źródło.
 */
function WierszZrodla({
  wpis,
  wyrozniony,
}: {
  readonly wpis: WpisZrodlaQ;
  readonly wyrozniony: boolean;
}): JSX.Element {
  const [otwarty, setOtwarty] = useState(false);
  const idSzczegolow = useId();
  // Karta #145: źródło i węzeł nazwane z modelu, nigdy referencją.
  const nazwaObiektu = useNazwaObiektu();
  const brakDanych = wpis.missing_data.length > 0;
  return (
    <>
      <tr
        className={wyrozniony ? 'mvd-oze-wyrozniony' : undefined}
        data-testid={`mvd-oze-adekw-zrodlo-${wpis.ref}`}
        data-wyrozniony={wyrozniony ? 'true' : undefined}
      >
        <th scope="row" className="mvd-ncrfg-kol-nazwa">
          <span className="mvd-ncrfg-wymaganie-nazwa">{nazwaObiektu(wpis.ref)}</span>
          {wpis.bus_ref ? (
            <span className="mvd-ncrfg-artykul">{nazwaObiektu(wpis.bus_ref)}</span>
          ) : null}
        </th>
        <td className="mvd-ncrfg-num">{mvar(wpis.q_actual_mvar)}</td>
        <td className="mvd-ncrfg-num">
          {mvar(wpis.q_min_mvar)} … {mvar(wpis.q_max_mvar)}
        </td>
        <KomorkaRezerwy wartosc={wpis.headroom_up_mvar} testid={`mvd-oze-adekw-gora-${wpis.ref}`} />
        <KomorkaRezerwy wartosc={wpis.headroom_down_mvar} testid={`mvd-oze-adekw-dol-${wpis.ref}`} />
        <td>
          <span
            data-uwaga={wpis.is_saturated || brakDanych ? 'brak' : undefined}
            data-testid={`mvd-oze-adekw-nasycenie-${wpis.ref}`}
          >
            {brakDanych
              ? PULPIT_STRINGS.adekwBrakDanych
              : wpis.is_saturated
                ? PULPIT_STRINGS.adekwPrzyGranicy
                : PULPIT_STRINGS.adekwNienasycone}
          </span>
        </td>
        <td className="mvd-ncrfg-kol-akcja">
          <button
            type="button"
            className="mvd-ncrfg-przelacz"
            aria-expanded={otwarty}
            aria-controls={idSzczegolow}
            onClick={() => setOtwarty((o) => !o)}
            data-testid={`mvd-oze-adekw-slad-otworz-${wpis.ref}`}
          >
            {otwarty ? PULPIT_STRINGS.sladUkryj : PULPIT_STRINGS.sladPokaz}
          </button>
        </td>
      </tr>
      {otwarty ? (
        <tr className="mvd-ncrfg-wiersz-szczegolow">
          <td colSpan={LICZBA_KOLUMN_Q} id={idSzczegolow} data-testid={`mvd-oze-adekw-szczegoly-${wpis.ref}`}>
            <p className="mvd-ncrfg-zdanie">{wpis.why_pl}</p>
            {brakDanych ? (
              <p className="mvd-ncrfg-zdanie">
                <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.adekwBrakDanych}: </span>
                <TekstZWzorami tekst={wpis.missing_data.map((kod) => BRAKI_DANYCH_Q[kod]).join('; ')} />
              </p>
            ) : null}
            {wpis.white_box.length > 0 ? <SladAnalizy kroki={wpis.white_box} /> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function SekcjaAdekwatnosciQ({
  szczegolyAudytowe,
  wyroznionyModul = null,
}: SekcjaAdekwatnosciQProps): JSX.Element {
  // Karta K8: aktywny bieg rodziny z magazynu kontekstu wyniku (jedna prawda wyboru).
  const runId = useAktywnyRunId('rozplyw');
  const stan = useAnaliza(runId, pobierzAdekwatnoscQ);
  const nazwaObiektu = useNazwaObiektu();
  const [uzasadnienie, setUzasadnienie] = useState(false);

  const wyroznionyWezel =
    stan.rodzaj === 'gotowe' && wyroznionyModul
      ? busRefModuluQ(stan.dane, wyroznionyModul)
      : null;

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
        <div data-testid="mvd-oze-adekw-wynik" className="mvd-ncrfg-wymagania">
          {/* Jedna linia: werdykt (zdanie backendu w szczegółach), rezerwa systemowa, bilans
              i proweniencja granic — standard warsztatu KD6. */}
          <div className="mvd-ncrfg-linia" data-testid="mvd-oze-adekw-podsum">
            <span
              className={`mvd-oze-komorka ${klasaWerdyktuQ(stan.dane.is_adequate, stan.dane.verdict)}`}
              data-testid="mvd-oze-adekw-werdykt"
            >
              {WERDYKTY_ADEKWATNOSCI_Q[stan.dane.verdict]}
            </span>
            <span>
              <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.adekwRezerwaSystem}: </span>
              <span className="mvd-ncrfg-num">
                {mvar(stan.dane.summary.network_headroom_up_mvar)} /{' '}
                {mvar(stan.dane.summary.network_headroom_down_mvar)} Mvar
              </span>
            </span>
            <span data-testid="mvd-oze-adekw-bilans">
              <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.adekwBilans}: </span>
              <span className="mvd-ncrfg-num">{mvar(stan.dane.balance.net_source_q_mvar)} Mvar</span>
            </span>
            {stan.dane.provenance ? (
              <span data-testid="mvd-oze-adekw-proweniencja">
                <span className="mvd-ncrfg-linia-etyk">{PULPIT_STRINGS.adekwProweniencja}: </span>
                {stan.dane.provenance.worst_quality_label_pl}
              </span>
            ) : null}
            <button
              type="button"
              className="mvd-ncrfg-przelacz"
              aria-expanded={uzasadnienie}
              onClick={() => setUzasadnienie((u) => !u)}
              data-testid="mvd-oze-adekw-uzasadnienie-przelacz"
            >
              {uzasadnienie ? PULPIT_STRINGS.sladUkryj : PULPIT_STRINGS.sladPokaz}
            </button>
          </div>
          {uzasadnienie ? (
            <div className="mvd-ncrfg-wiersz-szczegolow" data-testid="mvd-oze-adekw-uzasadnienie">
              <p className="mvd-ncrfg-zdanie">{stan.dane.why_pl}</p>
              {stan.dane.balance.white_box.length > 0 ? (
                <SladAnalizy kroki={stan.dane.balance.white_box} />
              ) : null}
            </div>
          ) : null}

          {wyroznionyModul && wyroznionyWezel ? (
            <p className="mvd-oze-wyroznienie-wezel" data-testid="mvd-oze-adekw-wyroznienie-wezel">
              {PULPIT_STRINGS.adekwWyroznionyWezel}: {nazwaObiektu(wyroznionyWezel)}
            </p>
          ) : null}
          {wyroznionyModul && !wyroznionyWezel ? (
            <p className="mvd-oze-wyroznienie-brak" data-testid="mvd-oze-adekw-wyroznienie-brak">
              {PULPIT_STRINGS.adekwWyroznienieBrak}
            </p>
          ) : null}
          {stan.dane.sources.length === 0 ? (
            <p style={{ margin: 0 }} className="mvd-oze-panel-etyk">
              {PULPIT_STRINGS.adekwBrakZrodel}
            </p>
          ) : (
            <table className="mvd-ncrfg-tabela" aria-label={PULPIT_STRINGS.adekwZrodla}>
              <thead>
                <tr>
                  <th scope="col">{PULPIT_STRINGS.adekwKolZrodlo}</th>
                  <th scope="col">
                    <TekstZWzorami tekst={PULPIT_STRINGS.adekwKolQ} />
                  </th>
                  <th scope="col">
                    <TekstZWzorami tekst={PULPIT_STRINGS.adekwKolZakres} />
                  </th>
                  <th scope="col">{PULPIT_STRINGS.adekwKolGora}</th>
                  <th scope="col">{PULPIT_STRINGS.adekwKolDol}</th>
                  <th scope="col">{PULPIT_STRINGS.adekwKolStan}</th>
                  <th scope="col">
                    <span className="mvd-sr-only">{PULPIT_STRINGS.sladPokaz}</span>
                  </th>
                </tr>
              </thead>
              <tbody data-testid="mvd-oze-adekw-zrodla">
                {stan.dane.sources.map((wpis) => (
                  <WierszZrodla
                    key={wpis.ref}
                    wpis={wpis}
                    wyrozniony={wyroznionyWezel !== null && wpis.bus_ref === wyroznionyWezel}
                  />
                ))}
              </tbody>
            </table>
          )}

          {stan.dane.voltage_violations.length === 0 ? (
            <p
              style={{ margin: 0 }}
              className="mvd-oze-panel-etyk"
              data-testid="mvd-oze-adekw-naruszenia-blok"
            >
              {PULPIT_STRINGS.adekwBrakNaruszen}
            </p>
          ) : (
            <table
              className="mvd-ncrfg-tabela"
              aria-label={PULPIT_STRINGS.adekwNaruszenia}
              data-testid="mvd-oze-adekw-naruszenia-blok"
            >
              <thead>
                <tr>
                  <th scope="col">{PULPIT_STRINGS.adekwNaruszenia}</th>
                  <th scope="col">
                    <TekstZWzorami tekst={PULPIT_STRINGS.adekwKolU} />
                  </th>
                  <th scope="col">{PULPIT_STRINGS.adekwKolUzasadnienie}</th>
                </tr>
              </thead>
              <tbody data-testid="mvd-oze-adekw-naruszenia">
                {stan.dane.voltage_violations.map((n) => (
                  <tr
                    key={n.bus_ref}
                    className={wyroznionyWezel === n.bus_ref ? 'mvd-oze-wyrozniony' : undefined}
                    data-wyrozniony={wyroznionyWezel === n.bus_ref ? 'true' : undefined}
                    data-testid={`mvd-oze-adekw-naruszenie-${n.bus_ref}`}
                  >
                    <th scope="row" className="mvd-ncrfg-kol-nazwa">
                      <span className="mvd-ncrfg-wymaganie-nazwa">{nazwaObiektu(n.bus_ref)}</span>
                      <span className="mvd-ncrfg-artykul">{n.kind_pl}</span>
                    </th>
                    <td className="mvd-ncrfg-num" data-uwaga="naruszenie">
                      {formatLiczba(n.v_pu, 3)}
                    </td>
                    <td className="mvd-ncrfg-artykul">{n.why_pl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Karta #145: identyfikator analizy wyłącznie w „Informacjach audytowych". */}
          <InformacjeAudytowe
            szczegolyAudytowe={szczegolyAudytowe}
            testid="mvd-oze-adekw-analiza-id"
            wiersze={[{ etykieta: PULPIT_STRINGS.identyfikatorAnalizy, wartosc: stan.dane.analysis_id }]}
          />
        </div>
      )}
    </section>
  );
}
