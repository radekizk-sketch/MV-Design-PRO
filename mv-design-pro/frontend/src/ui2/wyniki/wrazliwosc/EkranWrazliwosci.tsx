/*
 * EkranWrazliwosci — okno „Wrażliwość" (zakładka warsztatu Wyników; karta
 * ROUTERY-4A domyka łańcuch A6/A17 z macierzy pokrycia: moduły
 * `analysis/lf_sensitivity` i `analysis/sensitivity` miały ZERO konsumentów
 * produkcyjnych). Dwie sekcje na wspólnym wzorcu ekranu analizy
 * (`EkranAnalizy`), na jednym przebiegu rozpływu:
 *   1. Czynniki wpływu na profil napięć (LF) — ranking parametrów R/X/P/Q/U_n,
 *   2. Wrażliwość marginesów kryteriów (ogólna) — marginesy przy ±delta%.
 *
 * Przebieg dobierany z rejestru (`useExecutionRunsStore`: aktywny/ostatni
 * LOAD_FLOW/DONE — reużycie doboru z okna „Jakość wyników"). Zero fizyki,
 * zero ocen lokalnych — wartości, progi i werdykty WYŁĄCZNIE z backendu
 * (`GET /api/insights/sensitivity`). Stan zerowy prowadzi do brakującego biegu
 * (akcja „Uruchom obliczenie"). Identyfikatory (run id, bus id) wyłącznie w
 * trybie eksperckim. Wiersze rankingu nie niosą `dowodRef` — wartości liczy
 * builder analizy on-demand, a nie przebieg (kierowanie ich do śladu innego
 * przebiegu byłoby fałszywym dowodem — wzorzec jakości, zero fabrykacji).
 */

import { useEffect, useState } from 'react';
import './wrazliwosc.css';
import { useSwiezoscNaglowka } from '../../freshness';
import { EkranAnalizy, PrzyciskAkcjiStanu, useAkcjaUruchomObliczenie } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';
import { EtykietaWerdyktu, KartaWerdyktu } from '../wzorzec/KartaWerdyktu';
import { fetchWrazliwosc, type WezelWrazliwosci, type WpisOgolny, type WrazliwoscResponse } from './api';
import {
  KLUCZ_WIERSZA_LF,
  KLUCZ_WIERSZA_OGOLNEGO,
  KOLUMNY_LF,
  KOLUMNY_OGOLNE,
  naWierszeLf,
  naWierszeOgolne,
  naZalozeniaLf,
  naZalozeniaOgolne,
  nazwaWezla,
  kluczWpisuOgolnego,
} from './model';
import { WRAZLIWOSC_STRINGS as T, etykietaKryterium } from './strings';
import { useAktywnyBieg } from '../kontekst/kontekstWyniku';

// ---------------------------------------------------------------------------
// Stan zasobu (brak przebiegu / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

type StanZasobu =
  | { readonly rodzaj: 'brakPrzebiegu' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WrazliwoscResponse };

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
  akcja,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
  /* K6 / H-5: slot akcji stanu zerowego — realny następny krok (bieg obliczeń). */
  akcja?: AkcjaStanuZerowego;
}) {
  return (
    <div
      className={
        wariant === 'blad' ? 'mvd-wrazliwosc-stan mvd-wrazliwosc-stan--blad' : 'mvd-wrazliwosc-stan'
      }
      data-testid={testid}
    >
      <p className="mvd-wrazliwosc-stan-title">{komunikat}</p>
      {opis && <p className="mvd-wrazliwosc-stan-desc">{opis}</p>}
      <PrzyciskAkcjiStanu akcja={akcja} testid={testid} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Wrażliwość"
// ---------------------------------------------------------------------------

export interface EkranWrazliwosciProps {
  szczegolyAudytowe: boolean;
}

/** Brak dowodu przebiegu dla wartości builderów on-demand — celowy no-op. */
const BEZ_DOWODU = () => {};

export function EkranWrazliwosci({ szczegolyAudytowe }: EkranWrazliwosciProps) {
  // Karta K8: bieg z magazynu kontekstu wyniku (aktywny bieg rodziny) — jedna prawda wyboru.
  const przebieg = useAktywnyBieg('rozplyw');
  const runId = przebieg?.id ?? null;
  // V12K-264/265: znacznik świeżości nagłówka z JEDNEJ derywacji (K3).
  const swiezosc = useSwiezoscNaglowka(runId);
  // K6 / H-5: stan zerowy prowadzi do biegu, którego brakuje (rozpływ).
  const akcjaBiegu = useAkcjaUruchomObliczenie('LOAD_FLOW');

  const [stan, setStan] = useState<StanZasobu>(
    runId ? { rodzaj: 'ladowanie' } : { rodzaj: 'brakPrzebiegu' },
  );

  const [wybranyOgolny, setWybranyOgolny] = useState<string | null>(null);

  useEffect(() => {
    setWybranyOgolny(null);
    if (!runId) {
      setStan({ rodzaj: 'brakPrzebiegu' });
      return;
    }
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    fetchWrazliwosc(runId)
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (!anulowane) {
          setStan({
            rodzaj: 'blad',
            komunikat: err instanceof Error ? err.message : T.blad,
          });
        }
      });
    return () => {
      anulowane = true;
    };
  }, [runId]);

  return (
    <div className="mvd-wrazliwosc" data-testid="mvd-wrazliwosc-ekran">
      <header className="mvd-wrazliwosc-naglowek">
        <h2 className="mvd-wrazliwosc-tytul">{T.tytul}</h2>
        <p className="mvd-wrazliwosc-opis">{T.opisWstep}</p>
      </header>

      {stan.rodzaj === 'brakPrzebiegu' && (
        <StanPanel
          komunikat={T.brakPrzebiegu}
          opis={T.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-wrazliwosc-brak-przebiegu"
          akcja={akcjaBiegu}
        />
      )}
      {stan.rodzaj === 'ladowanie' && (
        <StanPanel komunikat={T.ladowanie} wariant="info" testid="mvd-wrazliwosc-ladowanie" />
      )}
      {stan.rodzaj === 'blad' && (
        <StanPanel
          komunikat={T.blad}
          opis={`${T.bladOpis} (${stan.komunikat})`}
          wariant="blad"
          testid="mvd-wrazliwosc-blad"
        />
      )}
      {stan.rodzaj === 'gotowe' && (
        <>
          <section className="mvd-wrazliwosc-sekcja" data-testid="mvd-wrazliwosc-lf">
            <EkranAnalizy
              naglowek={{
                analizaPL: T.sekcjaLf,
                runId: runId ?? undefined,
                ...swiezosc,
              }}
              zalozenia={naZalozeniaLf(stan.dane.lf)}
              kolumny={KOLUMNY_LF}
              wiersze={naWierszeLf(stan.dane.lf.top_drivers, stan.dane.wezly)}
              onOtworzDowod={BEZ_DOWODU}
              szczegolyAudytowe={szczegolyAudytowe}
              kluczWiersza={KLUCZ_WIERSZA_LF}
            />
          </section>
          <section className="mvd-wrazliwosc-sekcja" data-testid="mvd-wrazliwosc-ogolna">
            <EkranAnalizy
              naglowek={{
                analizaPL: T.sekcjaOgolna,
                runId: runId ?? undefined,
                ...swiezosc,
              }}
              zalozenia={naZalozeniaOgolne(stan.dane.ogolna)}
              kolumny={KOLUMNY_OGOLNE}
              wiersze={naWierszeOgolne(stan.dane.ogolna.entries, stan.dane.wezly)}
              onOtworzDowod={BEZ_DOWODU}
              szczegolyAudytowe={szczegolyAudytowe}
              kluczWiersza={KLUCZ_WIERSZA_OGOLNEGO}
              onWybierzWiersz={setWybranyOgolny}
              wybranyWiersz={wybranyOgolny}
            />
            <SzczegolWpisu
              wpis={
                stan.dane.ogolna.entries.find((w) => kluczWpisuOgolnego(w) === wybranyOgolny)
                ?? null
              }
              wezly={stan.dane.wezly}
            />
          </section>
          {stan.dane.pominiete_zrodla_pl.length > 0 && (
            <section
              className="mvd-wrazliwosc-pominiete"
              data-testid="mvd-wrazliwosc-pominiete"
            >
              <h3 className="mvd-wrazliwosc-sekcja-tytul">{T.pominieteTytul}</h3>
              <ul>
                {stan.dane.pominiete_zrodla_pl.map((zrodlo) => (
                  <li key={zrodlo}>{zrodlo}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}


/**
 * Szczegół wpisu wrażliwości ogólnej: rozstrzygnięcie stanu bazowego i obu perturbacji
 * WYŁĄCZNIE z rekordów K backendu — etykieta, zdanie, przyczyna, podstawa progu, margines,
 * dowód i zakres ważności (`KartaWerdyktu`). Żaden status nie stoi tu bez wyjaśnienia.
 */
function SzczegolWpisu({
  wpis,
  wezly,
}: {
  wpis: WpisOgolny | null;
  wezly: Readonly<Record<string, WezelWrazliwosci>>;
}) {
  if (!wpis) {
    return (
      <p className="mvd-wrazliwosc-szczegol-brak" data-testid="mvd-wrazliwosc-szczegol-pusty">
        {T.szczegolBrakWyboru}
      </p>
    );
  }
  const warianty = [
    { klucz: 'bazowy', tytul: T.wariantBazowy, ocena: wpis.ocena },
    { klucz: 'minus', tytul: T.wariantMinus, ocena: wpis.minus.ocena },
    { klucz: 'plus', tytul: T.wariantPlus, ocena: wpis.plus.ocena },
  ] as const;
  return (
    <section className="mvd-wrazliwosc-szczegol" data-testid="mvd-wrazliwosc-szczegol">
      <h3 className="mvd-wrazliwosc-sekcja-tytul">
        {etykietaKryterium(wpis.parameter_id)} — {nazwaWezla(wpis.target_id, wezly)}
      </h3>
      {warianty.map(({ klucz, tytul, ocena }) => (
        <div
          key={klucz}
          className="mvd-wrazliwosc-szczegol-wariant"
          data-testid={`mvd-wrazliwosc-szczegol-${klucz}`}
        >
          <div className="mvd-wrazliwosc-szczegol-head">
            <span className="mvd-wrazliwosc-szczegol-tytul">{tytul}</span>
            <EtykietaWerdyktu
              etykieta={ocena.etykieta}
              status={ocena.status_maszynowy}
              testid={`mvd-wrazliwosc-szczegol-${klucz}-etykieta`}
            />
          </div>
          <KartaWerdyktu rekord={ocena} />
        </div>
      ))}
    </section>
  );
}
