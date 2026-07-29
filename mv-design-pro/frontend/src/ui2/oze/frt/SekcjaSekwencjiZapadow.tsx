/*
 * SekcjaSekwencjiZapadow — sekcja „Sekwencja zapadów" okna „Walidacja modelu
 * falownika" (P43 / strumień OZE). Edytor listy zapadów (głębokość p.u. + czas s,
 * dodaj/usuń wiersz) + JAWNY bieg `GET /api/oze-analysis/frt-sequence` (moduł DER
 * i operator reużyte z górnej części ekranu) → prezentacja:
 *   1. odznaka werdyktu sekwencji (koniunkcja werdyktów zapadów — z backendu),
 *   2. założenia ZAWSZE widoczne (brak modelu stanu między zapadami — uczciwość),
 *   3. tabela zapadów na wzorcu `TabelaWynikow` (parametry, marginesy, werdykt),
 *   4. kontekst siły sieci (SCR/WSCR węzła) albo uczciwy powód jego braku;
 *      uzasadnienie `why_pl` + rozwijany ślad WHITE BOX (`white_box` z backendu,
 *      reużyty `SladAnalizy` z pulpitu — kroki tekstowe, zero LaTeX-a doklejanego w UI).
 *
 * Zero fizyki, zero ocen lokalnych — werdykty, marginesy i kontekst pochodzą
 * WYŁĄCZNIE z backendu. Serializacja (kropka dziesiętna) należy do klienta;
 * edytor prezentuje z przecinkiem PL. Identyfikator wejścia (hash) — tryb ekspercki.
 */

import { useEffect, useMemo, useState } from 'react';
import type { AdvancementMode } from '../../shell/modeModel';
import { isModeAtLeast } from '../../shell/modeModel';
import { TabelaWynikow } from '../../wyniki/wzorzec';
import { SladAnalizy } from '../pulpit';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { ANALYSIS_TYPE_LABELS, type ExecutionRun } from '../../../ui/study-cases/types';
import {
  pobierzSekwencjeFrt,
  type ParaZapaduFrt,
  type WidokSekwencjiFrt,
  type ZapytanieSekwencjiFrt,
} from '../api';
import {
  kolumnyTabeliSekwencji,
  werdyktSekwencji,
  wierszeTabeliSekwencji,
} from './sekwencjaModel';
import { FRT_STRINGS, fmtPuFrt, fmtSFrt } from './strings';

const ZAPAD_DOMYSLNY: ParaZapaduFrt = { glebokoscPu: 0.05, czasS: 0.15 };

/** Etykieta PL zakończonego przebiegu zwarciowego dla selektora kontekstu. */
function etykietaPrzebieguZwarciowego(run: ExecutionRun): string {
  const analiza = ANALYSIS_TYPE_LABELS[run.analysis_type];
  return run.finished_at ? `${analiza} · ${run.finished_at}` : analiza;
}

type StanZasobu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokSekwencjiFrt };

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-frt-stan mvd-frt-stan--blad' : 'mvd-frt-stan'}
      data-testid={testid}
    >
      <p className="mvd-frt-stan-title">{komunikat}</p>
      {opis && <p className="mvd-frt-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wynik sekwencji: odznaka werdyktu + założenia + tabela + kontekst siły sieci
// ---------------------------------------------------------------------------

function WynikSekwencji({
  dane,
  trybZaawansowania,
}: {
  dane: WidokSekwencjiFrt;
  trybZaawansowania: AdvancementMode;
}) {
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');
  // Ślad WHITE BOX kontekstu siły sieci — NA ŻĄDANIE (domyślnie zwinięty).
  const [sladWidoczny, setSladWidoczny] = useState(false);
  const werdykt = useMemo(() => werdyktSekwencji(dane), [dane]);
  const kolumny = useMemo(() => kolumnyTabeliSekwencji(), []);
  const wiersze = useMemo(() => wierszeTabeliSekwencji(dane), [dane]);
  const kontekst = dane.kontekst_sily_sieci;

  return (
    <div data-testid="mvd-frt-sekw-wynik">
      <span
        className={`mvd-frt-sekw-odznaka mvd-frt-sekw-odznaka--${werdykt.istotnosc}`}
        data-testid="mvd-frt-sekw-werdykt"
      >
        {werdykt.tekst}
      </span>
      <p className="mvd-frt-sekw-opis">{FRT_STRINGS.sekwWerdyktOpis}</p>

      <p className="mvd-frt-sekw-zalozenia" data-testid="mvd-frt-sekw-zalozenia">
        {dane.zalozenia_pl}
      </p>

      <TabelaWynikow
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
      />

      <section className="mvd-frt-sekw-kontekst" data-testid="mvd-frt-sekw-kontekst">
        <h4 className="mvd-frt-sekw-kontekst-tytul">{FRT_STRINGS.sekwKontekstTytul}</h4>
        {kontekst === null ? (
          <p className="mvd-frt-sekw-kontekst-powod" data-testid="mvd-frt-sekw-kontekst-powod">
            {dane.kontekst_sily_sieci_powod_pl ?? FRT_STRINGS.kreska}
          </p>
        ) : (
          <>
            <dl className="mvd-frt-sekw-kontekst-dane" data-testid="mvd-frt-sekw-kontekst-dane">
            <div className="mvd-frt-zal-para">
              <dt>{FRT_STRINGS.sekwKontekstWezel}</dt>
              <dd>{kontekst.bus_ref}</dd>
            </div>
            <div className="mvd-frt-zal-para">
              <dt>{FRT_STRINGS.sekwKontekstScr}</dt>
              <dd className="mvd-num">
                {kontekst.scr === null ? FRT_STRINGS.kreska : fmtPuFrt(kontekst.scr)}
              </dd>
            </div>
            <div className="mvd-frt-zal-para">
              <dt>{FRT_STRINGS.sekwKontekstMocZwarciowa}</dt>
              <dd className="mvd-num">
                {kontekst.s_sc_mva === null
                  ? FRT_STRINGS.kreska
                  : `${fmtSFrt(kontekst.s_sc_mva)} ${FRT_STRINGS.jednMva}`}
              </dd>
            </div>
            <div className="mvd-frt-zal-para">
              <dt>{FRT_STRINGS.sekwKontekstMocZainstalowana}</dt>
              <dd className="mvd-num">
                {kontekst.s_installed_mva === null
                  ? FRT_STRINGS.kreska
                  : `${fmtSFrt(kontekst.s_installed_mva)} ${FRT_STRINGS.jednMva}`}
              </dd>
            </div>
            <div className="mvd-frt-zal-para">
              <dt>{FRT_STRINGS.sekwKontekstWerdykt}</dt>
              <dd>{kontekst.verdict}</dd>
            </div>
            </dl>
            <p className="mvd-frt-sekw-kontekst-why" data-testid="mvd-frt-sekw-kontekst-why">
              {kontekst.why_pl}
            </p>
            {kontekst.white_box.length > 0 && (
              <div className="mvd-frt-sekw-slad-blok">
                <button
                  type="button"
                  className="mvd-frt-sekw-slad-btn"
                  aria-expanded={sladWidoczny}
                  onClick={() => setSladWidoczny((s) => !s)}
                  data-testid="mvd-frt-sekw-slad-otworz"
                >
                  {sladWidoczny
                    ? FRT_STRINGS.sekwKontekstSladUkryj
                    : FRT_STRINGS.sekwKontekstSladPokaz}
                </button>
                {sladWidoczny && (
                  <div className="mvd-oze" data-testid="mvd-frt-sekw-slad">
                    <span className="mvd-frt-sekw-slad-tytul">
                      {FRT_STRINGS.sekwKontekstSladTytul}
                    </span>
                    <SladAnalizy kroki={kontekst.white_box} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {trybEkspercki && (
        <dl className="mvd-frt-eksp" data-testid="mvd-frt-sekw-eksp">
          <div className="mvd-frt-eksp-para">
            <dt>{FRT_STRINGS.sekwEkspHash}</dt>
            <dd className="mvd-num">{dane.input_hash}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sekcja „Sekwencja zapadów"
// ---------------------------------------------------------------------------

export interface SekcjaSekwencjiZapadowProps {
  /** Referencja typu katalogowego modułu (z górnego doboru) — `null` blokuje bieg. */
  derRef: string | null;
  /** Operator OSD (z górnego doboru) — pusty łańcuch blokuje bieg. */
  operatorId: string;
  trybZaawansowania: AdvancementMode;
}

export function SekcjaSekwencjiZapadow({
  derRef,
  operatorId,
  trybZaawansowania,
}: SekcjaSekwencjiZapadowProps) {
  const [zapady, setZapady] = useState<ParaZapaduFrt[]>([ZAPAD_DOMYSLNY]);
  const [wybranyRun, setWybranyRun] = useState('');
  const [busRef, setBusRef] = useState('');
  const [zapytanie, setZapytanie] = useState<ZapytanieSekwencjiFrt | null>(null);
  const [stan, setStan] = useState<StanZasobu>({ rodzaj: 'idle' });

  // Zakończone przebiegi zwarciowe z rejestru przebiegów (wzorzec filtrowania
  // rodzaju jak `useWpiecieWynikow`: status „DONE" + typ analizy „SC_*").
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const przebiegiZwarciowe = useMemo(
    () => przebiegi.filter((r) => r.status === 'DONE' && r.analysis_type.startsWith('SC_')),
    [przebiegi],
  );

  // Zmiana doboru/edytora unieważnia poprzedni wynik (stale-result guard).
  const unewaznij = () => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  };

  useEffect(() => {
    unewaznij();
  }, [derRef, operatorId]);

  // Jawny bieg sekwencji.
  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    pobierzSekwencjeFrt(zapytanie)
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setStan({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  const dobranyKomplet = derRef !== null && operatorId !== '';

  const zmienZapad = (indeks: number, pole: keyof ParaZapaduFrt, wartosc: number) => {
    setZapady((poprz) => poprz.map((z, i) => (i === indeks ? { ...z, [pole]: wartosc } : z)));
    unewaznij();
  };
  const dodajZapad = () => {
    setZapady((poprz) => [...poprz, ZAPAD_DOMYSLNY]);
    unewaznij();
  };
  const usunZapad = (indeks: number) => {
    setZapady((poprz) => (poprz.length <= 1 ? poprz : poprz.filter((_, i) => i !== indeks)));
    unewaznij();
  };

  const zmienRun = (id: string) => {
    setWybranyRun(id);
    unewaznij();
  };
  const zmienBus = (wartosc: string) => {
    setBusRef(wartosc);
    unewaznij();
  };

  const uruchom = () => {
    if (derRef === null || operatorId === '' || zapady.length === 0) return;
    // Bez wyboru przebiegu/węzła — zachowanie dzisiejsze (kontekst pominięty).
    const runId = wybranyRun || undefined;
    const wezel = busRef.trim() || undefined;
    setZapytanie({
      derRef,
      operatorId,
      zapady,
      ...(runId ? { runId } : {}),
      ...(wezel ? { busRef: wezel } : {}),
    });
  };

  return (
    <section className="mvd-frt-sekwencja" data-testid="mvd-frt-sekwencja">
      <header className="mvd-frt-sekw-naglowek">
        <h3 className="mvd-frt-sekw-tytul">{FRT_STRINGS.sekwTytul}</h3>
        <p className="mvd-frt-sekw-opis">{FRT_STRINGS.sekwOpis}</p>
      </header>

      {!dobranyKomplet ? (
        <StanPanel
          komunikat={FRT_STRINGS.sekwBrakDoboru}
          opis={FRT_STRINGS.sekwBrakDoboruOpis}
          wariant="info"
          testid="mvd-frt-sekw-brak-doboru"
        />
      ) : (
        <>
          <div className="mvd-frt-sekw-edytor" data-testid="mvd-frt-sekw-edytor">
            <div
              className="mvd-frt-sekw-kontekst-dobor"
              data-testid="mvd-frt-sekw-kontekst-dobor"
            >
              <span className="mvd-frt-sekw-edytor-tytul">
                {FRT_STRINGS.sekwKontekstDoborTytul}
              </span>
              <p className="mvd-frt-pole-opis">{FRT_STRINGS.sekwKontekstDoborOpis}</p>
              <div className="mvd-frt-sekw-pole">
                <label htmlFor="mvd-frt-sekw-run">{FRT_STRINGS.sekwKontekstRunEtykieta}</label>
                <select
                  id="mvd-frt-sekw-run"
                  value={wybranyRun}
                  onChange={(e) => zmienRun(e.target.value)}
                  data-testid="mvd-frt-sekw-run"
                >
                  <option value="">{FRT_STRINGS.sekwKontekstRunPusty}</option>
                  {przebiegiZwarciowe.map((run) => (
                    <option key={run.id} value={run.id}>
                      {etykietaPrzebieguZwarciowego(run)}
                    </option>
                  ))}
                </select>
                {przebiegiZwarciowe.length === 0 ? (
                  <p className="mvd-frt-pole-opis" data-testid="mvd-frt-sekw-run-brak">
                    {FRT_STRINGS.sekwKontekstRunBrak}
                  </p>
                ) : null}
              </div>
              <div className="mvd-frt-sekw-pole">
                <label htmlFor="mvd-frt-sekw-bus">{FRT_STRINGS.sekwKontekstBusEtykieta}</label>
                <input
                  id="mvd-frt-sekw-bus"
                  type="text"
                  value={busRef}
                  onChange={(e) => zmienBus(e.target.value)}
                  placeholder={FRT_STRINGS.sekwKontekstBusPlaceholder}
                  data-testid="mvd-frt-sekw-bus"
                />
                <p className="mvd-frt-pole-opis">{FRT_STRINGS.sekwKontekstBusOpis}</p>
              </div>
            </div>

            <span className="mvd-frt-sekw-edytor-tytul">{FRT_STRINGS.sekwEdytorTytul}</span>
            {zapady.map((zapad, i) => (
              <div key={i} className="mvd-frt-sekw-wiersz" data-testid="mvd-frt-sekw-wiersz">
                <div className="mvd-frt-sekw-pole">
                  <label htmlFor={`mvd-frt-sekw-glebokosc-${i}`}>{FRT_STRINGS.sekwKolGlebokosc}</label>
                  <input
                    id={`mvd-frt-sekw-glebokosc-${i}`}
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={zapad.glebokoscPu}
                    onChange={(e) => zmienZapad(i, 'glebokoscPu', Number(e.target.value))}
                    data-testid={`mvd-frt-sekw-glebokosc-${i}`}
                  />
                </div>
                <div className="mvd-frt-sekw-pole">
                  <label htmlFor={`mvd-frt-sekw-czas-${i}`}>{FRT_STRINGS.sekwKolCzas}</label>
                  <input
                    id={`mvd-frt-sekw-czas-${i}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={zapad.czasS}
                    onChange={(e) => zmienZapad(i, 'czasS', Number(e.target.value))}
                    data-testid={`mvd-frt-sekw-czas-${i}`}
                  />
                </div>
                <button
                  type="button"
                  className="mvd-frt-sekw-usun"
                  onClick={() => usunZapad(i)}
                  disabled={zapady.length <= 1}
                  aria-label={FRT_STRINGS.sekwUsunAria}
                  data-testid={`mvd-frt-sekw-usun-${i}`}
                >
                  {FRT_STRINGS.sekwUsunWiersz}
                </button>
              </div>
            ))}
            <div className="mvd-frt-sekw-akcje">
              <button
                type="button"
                className="mvd-frt-sekw-dodaj"
                onClick={dodajZapad}
                data-testid="mvd-frt-sekw-dodaj"
              >
                {FRT_STRINGS.sekwDodajWiersz}
              </button>
              <button
                type="button"
                className="mvd-frt-oblicz"
                onClick={uruchom}
                disabled={zapady.length === 0}
                data-testid="mvd-frt-sekw-oblicz"
              >
                {zapytanie === null
                  ? FRT_STRINGS.sekwPrzyciskOblicz
                  : FRT_STRINGS.sekwPrzyciskPrzelicz}
              </button>
            </div>
          </div>

          {stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={FRT_STRINGS.sekwIdle}
              opis={FRT_STRINGS.sekwIdleOpis}
              wariant="info"
              testid="mvd-frt-sekw-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel
              komunikat={FRT_STRINGS.sekwLadowanie}
              wariant="info"
              testid="mvd-frt-sekw-ladowanie"
            />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={FRT_STRINGS.sekwBlad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-frt-sekw-blad"
            />
          ) : (
            <WynikSekwencji dane={stan.dane} trybZaawansowania={trybZaawansowania} />
          )}
        </>
      )}
    </section>
  );
}
