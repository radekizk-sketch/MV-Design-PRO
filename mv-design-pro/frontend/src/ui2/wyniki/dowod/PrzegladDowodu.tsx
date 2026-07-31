/*
 * PRZEGLĄD DOWODU (karta E9.1 / W-608) — okno „Dowód obliczeń" w nowej powłoce.
 * Kompozycja: nagłówek (nazwa analizy PL + odcisk danych wejściowych w trybie
 * eksperckim) → spis kroków (lewa kolumna, nawigowalny klawiaturą) → widok
 * aktywnego kroku w kanonie pięciu pól. Stany: pusty ślad („przebieg bez śladu
 * obliczeń"), ładowanie — sterowane propsami.
 *
 * W pełni sterowany propsami — DANE PRZEZ PROPS (ładowanie śladu wpina zarządca
 * przy scaleniu). Read-only, zero fizyki (NOT-A-SOLVER), zero mutacji store'ów.
 * Identyfikatory (input_hash) wyłącznie w trybie eksperckim, jako wyrażenie `{...}`.
 */

import { useMemo, useState } from 'react';
import './dowod.css';
import type { TraceStep } from '../../../ui/results-inspector/types';
import type { AdvancementMode } from '../../shell/modeModel';
import { KrokDowodu } from './KrokDowodu';
import { SpisKrokow } from './SpisKrokow';
import { DOWOD_STRINGS } from './strings';
import { mapujKroki } from './dowodModel';
import { PrzyciskAkcjiStanu } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';

/**
 * Wskazany element wywodu (KD-4, ZAMKNIĘCIE luki L-11). Kroki są WYBRANE, nie
 * policzone — rozstrzyga je `resolveTraceStepsForElement` po `selection_index`
 * i referencjach kroku (ten sam dostawca, którego używał panel dowodu
 * elementu w moście). Pusta lista = ślad nie wiąże żadnego kroku z tym
 * elementem (uczciwy brak, nie „element bez wpływu na wynik").
 */
export interface WskazanyElementDowodu {
  /** Nazwa elementu w języku ekranu (pierwszy plan). */
  readonly nazwa: string;
  /** Kroki śladu przypisane temu elementowi (podzbiór `kroki`). */
  readonly kroki: TraceStep[];
}

export interface PrzegladDowoduProps {
  /** Nazwa analizy po polsku (pierwszy plan). */
  analizaPL: string;
  /** Ślad WHITE BOX przebiegu (dane przez props; pusty = „przebieg bez śladu"). */
  kroki: TraceStep[];
  /**
   * Element, na który wskazał użytkownik (2× klik na wartości z dowodem albo
   * selekcja na schemacie). Obecny = okno startuje na wywodzie TEGO elementu,
   * z jawnym przełącznikiem na cały przebieg.
   */
  wskazanyElement?: WskazanyElementDowodu | null;
  /** Odcisk danych wejściowych — pokazywany WYŁĄCZNIE w trybie eksperckim. */
  inputHash?: string;
  trybZaawansowania: AdvancementMode;
  /** Ślad w trakcie ładowania (sterowane propsami). */
  ladowanie?: boolean;
  /**
   * Akcja stanu zerowego (K6 / H-5) — realny następny krok, gdy nie ma czego
   * dowodzić (brak przebiegu ze śladem). Sterowana propsami jak reszta okna.
   */
  akcjaPusty?: AkcjaStanuZerowego;
}

export function PrzegladDowodu({
  analizaPL,
  kroki,
  wskazanyElement,
  inputHash,
  trybZaawansowania,
  ladowanie,
  akcjaPusty,
}: PrzegladDowoduProps) {
  // L-11: gdy element ma własne kroki, okno startuje na NIM (o to prosił
  // użytkownik, wskazując element); bez kroków zostaje cały przebieg.
  const elementMaKroki = (wskazanyElement?.kroki.length ?? 0) > 0;
  const [zakresElementu, setZakresElementu] = useState(elementMaKroki);
  const [wybrany, setWybrany] = useState(0);
  const trybEkspercki = trybZaawansowania === 'expert';

  // Wskazanie innego elementu (albo jego zniknięcie) przestawia zakres —
  // inaczej okno pokazywałoby wywód poprzedniego wskazania.
  const kluczElementu = `${wskazanyElement?.nazwa ?? ''}:${wskazanyElement?.kroki.length ?? 0}`;
  const [poprzedniKlucz, setPoprzedniKlucz] = useState(kluczElementu);
  if (poprzedniKlucz !== kluczElementu) {
    setPoprzedniKlucz(kluczElementu);
    setZakresElementu(elementMaKroki);
    setWybrany(0);
  }

  const zawezone = zakresElementu && elementMaKroki;
  const krokiWidoku = zawezone ? wskazanyElement!.kroki : kroki;
  const model = useMemo(() => mapujKroki(krokiWidoku), [krokiWidoku]);

  if (ladowanie) {
    return (
      <div className="mvd-dowod" data-testid="mvd-dowod-ladowanie">
        <p className="mvd-dowod-ladowanie">{DOWOD_STRINGS.ladowanie}</p>
      </div>
    );
  }

  if (model.length === 0) {
    return (
      <div className="mvd-dowod" data-testid="mvd-dowod-pusty">
        <div className="mvd-dowod-pusty">
          <p className="mvd-dowod-pusty-title">{DOWOD_STRINGS.brakSladu}</p>
          <p className="mvd-dowod-pusty-desc">{DOWOD_STRINGS.brakSladuOpis}</p>
          <PrzyciskAkcjiStanu akcja={akcjaPusty} testid="mvd-dowod-pusty" />
        </div>
      </div>
    );
  }

  const indeks = wybrany < model.length ? wybrany : 0;
  const pozycje = model.map((k) => ({ numer: k.numer, tytul: k.tytul }));

  return (
    <div className="mvd-dowod" data-testid="mvd-dowod">
      <header className="mvd-dowod-head" data-testid="mvd-dowod-naglowek">
        <h2 className="mvd-dowod-title">{analizaPL}</h2>
        {trybEkspercki && inputHash && (
          <span
            className="mvd-dowod-hash mvd-num"
            aria-label={DOWOD_STRINGS.odciskWejscia}
            data-testid="mvd-dowod-input-hash"
          >
            {inputHash}
          </span>
        )}
      </header>

      {wskazanyElement && (
        <div className="mvd-dowod-zakres" data-testid="mvd-dowod-zakres">
          <span className="mvd-dowod-zakres-etyk">{DOWOD_STRINGS.zakresEtykieta}</span>
          <button
            type="button"
            className="mvd-dowod-zakres-btn"
            data-testid="mvd-dowod-zakres-element"
            aria-pressed={zawezone}
            disabled={!elementMaKroki}
            onClick={() => {
              setZakresElementu(true);
              setWybrany(0);
            }}
          >
            {`${wskazanyElement.nazwa} (${wskazanyElement.kroki.length})`}
          </button>
          <button
            type="button"
            className="mvd-dowod-zakres-btn"
            data-testid="mvd-dowod-zakres-caly"
            aria-pressed={!zawezone}
            onClick={() => {
              setZakresElementu(false);
              setWybrany(0);
            }}
          >
            {`${DOWOD_STRINGS.zakresCaly} (${kroki.length})`}
          </button>
          {!elementMaKroki && (
            <span className="mvd-dowod-zakres-uwaga" data-testid="mvd-dowod-zakres-brak">
              {DOWOD_STRINGS.zakresBrakKrokow}
            </span>
          )}
        </div>
      )}

      <div className="mvd-dowod-uklad">
        <nav className="mvd-dowod-spis-kol" aria-label={DOWOD_STRINGS.spisTytul}>
          <h3 className="mvd-dowod-spis-tytul">{DOWOD_STRINGS.spisTytul}</h3>
          <SpisKrokow pozycje={pozycje} aktywnyIndeks={indeks} onWybierz={setWybrany} />
        </nav>

        <div className="mvd-dowod-krok-kol">
          <KrokDowodu krok={model[indeks]} trybZaawansowania={trybZaawansowania} />
        </div>
      </div>
    </div>
  );
}
